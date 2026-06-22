import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatbotSession, ChatbotSessionStatus, Contact, Chatbot, MessageType } from '@prisma/client';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { MessagingService } from '../../messaging/messaging.service';
import axios from 'axios';
import { parsePhoneNumber, getCountryCallingCode } from 'libphonenumber-js';
import { v4 as uuidv4 } from 'uuid';
import { WhatsAppFlowsService } from '../../flows/whatsapp-flows.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

interface FlowNode {
  id: string;
  type: string;
  data: any;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

@Injectable()
export class FlowExecutorService {
  private readonly logger = new Logger(FlowExecutorService.name);

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    private messagingService: MessagingService,
    private flowsService: WhatsAppFlowsService,
    private realtimeGateway: RealtimeGateway,
    @InjectQueue('flow-delays') private delayQueue: Queue,
  ) {}

  // ─── Session Lifecycle ───────────────────────────────────────────────────

  async startSession(orgId: string, accountId: string, chatbot: Chatbot, contact: Contact, messageData: any) {
    this.logger.log(`Starting flow ${chatbot.id} for contact ${contact.phone}`);
    const flowData = chatbot.flowData as any;
    if (!flowData?.nodes?.length) return;

    const triggerNode = flowData.nodes.find((n: any) => n.type === 'triggerNode' || n.data?.isTrigger) || flowData.nodes[0];

    const session = await this.prisma.chatbotSession.create({
      data: {
        organizationId: orgId,
        chatbotId: chatbot.id,
        contactId: contact.id,
        accountId,
        currentNodeId: triggerNode.id,
        status: ChatbotSessionStatus.ACTIVE,
        variables: {},
      },
    });

    // Increment execution count and emit real-time update
    try {
      const updatedChatbot = await this.prisma.chatbot.update({
        where: { id: chatbot.id },
        data: { executions: { increment: 1 } },
      });
      this.realtimeGateway.emitChatbotUpdate(orgId, {
        id: chatbot.id,
        executions: updatedChatbot.executions,
      });
    } catch (e) {
      this.logger.error(`Failed to increment executions for chatbot ${chatbot.id}: ${e.message}`);
    }

    await this.executeNode(session, triggerNode, flowData.edges || [], flowData.nodes, contact, messageData);
  }

  async resumeSession(session: ChatbotSession, contact: Contact, messageData: any) {
    this.logger.log(`Resuming session ${session.id} for contact ${contact.phone}`);
    const flowData = (await this.prisma.chatbot.findUnique({ where: { id: session.chatbotId } }))?.flowData as any;
    if (!flowData) return;

    let currentNode = flowData.nodes.find((n: any) => n.id === session.currentNodeId);
    if (!currentNode) { await this.markCompleted(session.id); return; }

    const waitingType = (session as any).waitingNodeType as string | null;
    let variables = (session.variables || {}) as Record<string, any>;
    let routeHandle: string | undefined = undefined;

    // ── Capture user input based on what we were waiting for ──────────────
    if (waitingType === 'ask') {
      const config = currentNode.data?.config || {};
      const varName = config.variableName || config.saveToVariable;
      if (varName) {
        const userInput = messageData.text?.body ?? messageData.interactive?.button_reply?.title ?? messageData.interactive?.list_reply?.title ?? '';
        
        const match = varName.match(/^\{\{(custom|var|contact)\.(.+)\}\}$/);
        if (match) {
          const [_, type, field] = match;
          if (type === 'custom') {
            const currentFields = ((contact as any).customFields as Record<string, any>) || {};
            await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [field]: userInput } } });
            variables = { ...variables, [`custom.${field}`]: userInput };
          } else if (type === 'var') {
            variables = { ...variables, [`var.${field}`]: userInput };
          } else if (type === 'contact') {
            await this.prisma.contact.update({ where: { id: contact.id }, data: { [field]: userInput } });
          }
        } else {
          if (varName.startsWith('custom.')) {
            const fieldName = varName.replace('custom.', '');
            const currentFields = ((contact as any).customFields as Record<string, any>) || {};
            await this.prisma.contact.update({
              where: { id: contact.id },
              data: { customFields: { ...currentFields, [fieldName]: userInput } },
            });
            // Also store in variables so it's immediately available without a reload
            variables = { ...variables, [varName]: userInput };
          } else if (varName.startsWith('var.')) {
            const name = varName.replace('var.', '');
            variables = { ...variables, [name]: userInput };
          } else {
            variables = { ...variables, [varName]: userInput };
          }
        }

        await this.prisma.chatbotSession.update({
          where: { id: session.id },
          data: { variables },
        });
      }
      routeHandle = 'output';
    } else if (waitingType === 'askText') {
      const config = currentNode.data?.config || {};
      const userInput = messageData.text?.body || '';
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;
      const varName = config.variableName || config.saveToVar;

      // Basic Validation (for text, we just check if it's not empty)
      const isValid = userInput.trim().length > 0;

      if (isValid) {
        if (varName) {
           const match = varName.match(/^\{\{(custom|var|contact)\.(.+)\}\}$/);
           if (match) {
             const [_, type, field] = match;
             if (type === 'custom') {
               const currentFields = ((contact as any).customFields as Record<string, any>) || {};
               await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [field]: userInput } } });
               variables = { ...variables, [`custom.${field}`]: userInput };
             } else if (type === 'var') {
               variables = { ...variables, [`var.${field}`]: userInput };
             } else if (type === 'contact') {
               await this.prisma.contact.update({ where: { id: contact.id }, data: { [field]: userInput } });
             }
           } else {
             // Legacy fallback
             const currentFields = ((contact as any).customFields as Record<string, any>) || {};
             await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [varName]: userInput } } });
             variables = { ...variables, [`custom.${varName}`]: userInput };
           }
           await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          // Send error message and stay at this node
          const errorMsg = config.validationErrorMessage || 'Invalid input. Please try again.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { 
              metadata: { ...(session.metadata as any), currentAttempt } 
            },
          });
          return; // Don't advance, wait for next reply
        } else {
          // Max attempts reached
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askNumber') {
      const config = currentNode.data?.config || {};
      const userInput = messageData.text?.body || '';
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;
      const fieldName = config.saveToVar;

      // Numeric Validation
      const isNumeric = !isNaN(parseFloat(userInput)) && isFinite(Number(userInput));

      if (isNumeric) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: parseFloat(userInput) } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: userInput };
          await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Invalid number. Please try again.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askDate') {
      const config = currentNode.data?.config || {};
      const userInput = messageData.text?.body || '';
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;
      const fieldName = config.saveToVar;

      // Date Validation (Supports YYYY-MM-DD, DD/MM/YYYY, etc. via JS Date)
      const date = new Date(userInput);
      const isValidDate = !isNaN(date.getTime());

      if (isValidDate) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: date.toISOString() } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: date.toISOString().split('T')[0] };
          await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Invalid date format. Please try again.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askEmail') {
      const config = currentNode.data?.config || {};
      const userInput = messageData.text?.body || '';
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;
      const fieldName = config.saveToVar;

      // Email Validation Regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValidEmail = emailRegex.test(userInput.trim());

      if (isValidEmail) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: userInput.trim().toLowerCase() } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: userInput.trim().toLowerCase() };
          await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Invalid email address. Please try again.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'button') {
      // Route by button ID — each button's ID maps to a sourceHandle like "btn_BUTTONID"
      const buttonId = messageData.interactive?.button_reply?.id ?? messageData.button?.payload ?? '';
      const buttonTitle = messageData.interactive?.button_reply?.title ?? messageData.button?.text ?? buttonId;
      const varName = currentNode.data?.config?.saveToVariable;
      
      if (varName) {
        if (varName.startsWith('custom.')) {
          const fieldName = varName.replace('custom.', '');
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: buttonTitle } },
          });
          variables = { ...variables, [varName]: buttonTitle };
        } else {
          const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
          variables = { ...variables, [name]: buttonTitle };
        }
      }

      // Automatically track the interaction path for analytics and Excel export
      const nodeLabel = currentNode.data?.label || 'Interactive';
      variables[`Interaction: ${nodeLabel}`] = buttonTitle;
      await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });

      routeHandle = buttonId ? `btn_${buttonId}` : 'output';
    } else if (waitingType === 'list') {
      const listId = messageData.interactive?.list_reply?.id ?? '';
      const listTitle = messageData.interactive?.list_reply?.title ?? listId;
      const varName = currentNode.data?.config?.saveToVariable;
      
      if (varName) {
        if (varName.startsWith('custom.')) {
          const fieldName = varName.replace('custom.', '');
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: listTitle } },
          });
          variables = { ...variables, [varName]: listTitle };
        } else {
          const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
          variables = { ...variables, [name]: listTitle };
        }
      }

      // Automatically track the list selection for analytics and Excel export
      const nodeLabel = currentNode.data?.label || 'List';
      variables[`List Selection: ${nodeLabel}`] = listTitle;
      await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });

      routeHandle = listId ? `list_${listId}` : 'output';

      // Advanced Tree Routing: In modular list trees, we resume from the specific listRow node
      if (listId) {
        const targetRowNode = flowData.nodes.find((n: any) => n.type === 'listRow' && (n.data?.config?.rowId === listId || n.id === listId));
        if (targetRowNode) {
          currentNode = targetRowNode;
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { currentNodeId: targetRowNode.id }
          });
          routeHandle = 'output'; // listRow nodes use the default 'output' handle
        }
      }
    } else if (waitingType === 'askLocation') {
      const config = currentNode.data?.config || {};
      const location = messageData.location;
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;
      const fieldName = config.saveToVar;

      if (location && location.latitude && location.longitude) {
        const coordsStr = JSON.stringify({ latitude: location.latitude, longitude: location.longitude });
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: coordsStr } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: coordsStr };
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Please share your location pin to continue.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askAddress') {
      const config = currentNode.data?.config || {};
      const addressData = messageData.interactive?.address_message?.address_data;
      const fieldName = config.saveToVar;

      if (addressData) {
        const addressStr = JSON.stringify(addressData);
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: addressStr } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: addressStr };
        }
        routeHandle = 'submitted';
      } else {
        routeHandle = 'notSubmitted';
      }
    } else if (waitingType === 'askImage') {
      const config = currentNode.data?.config || {};
      const mediaId = messageData.image?.id;
      const fieldName = config.saveToVar;
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;

      if (mediaId) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: mediaId } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: mediaId };
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Please upload an image to continue.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askVideo') {
      const config = currentNode.data?.config || {};
      const mediaId = messageData.video?.id;
      const fieldName = config.saveToVar;
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;

      if (mediaId) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: mediaId } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: mediaId };
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Please upload a video to continue.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askAudio') {
      const config = currentNode.data?.config || {};
      const mediaId = messageData.audio?.id;
      const fieldName = config.saveToVar;
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;

      if (mediaId) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: mediaId } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: mediaId };
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Please send your audio message to continue.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'askFile') {
      const config = currentNode.data?.config || {};
      const mediaId = messageData.document?.id;
      const fieldName = config.saveToVar;
      const attemptLimit = config.attemptLimit || 3;
      const currentAttempt = ((session.metadata as any)?.currentAttempt || 0) + 1;

      if (mediaId) {
        if (fieldName) {
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: mediaId } },
          });
          variables = { ...variables, [`custom.${fieldName}`]: mediaId };
        }
        routeHandle = 'submitted';
      } else {
        if (currentAttempt < attemptLimit) {
          const errorMsg = config.validationErrorMessage || 'Please upload the requested file to continue.';
          await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { metadata: { ...(session.metadata as any), currentAttempt } },
          });
          return;
        } else {
          routeHandle = 'notSubmitted';
        }
      }
    } else if (waitingType === 'flow') {
      const config = currentNode.data?.config || {};
      const interactive = messageData.interactive;
      
      if (interactive?.type === 'nfm_reply') {
        try {
          const responseJson = JSON.parse(interactive.nfm_reply.response_json || '{}');
          
          // 1. Log submission to database & sync with CRM
          if (config.flowId) {
             await this.flowsService.handleFlowSubmission(
                session.organizationId,
                config.flowId,
                contact.id,
                responseJson
              );
          }

          // 2. Advance to "Submitted" branch
          routeHandle = 'submitted';
        } catch (err) {
          this.logger.error(`Error parsing flow response: ${err.message}`);
          routeHandle = 'notSubmitted';
        }
      } else {
        routeHandle = 'notSubmitted';
      }
    }


    // Mark active again
    const updatedSession = await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: { status: ChatbotSessionStatus.ACTIVE, waitingForInput: false, waitingNodeType: null },
    });

    // Refresh contact to ensure any customFields updated during this step are available to the next node
    const refreshedContact = await this.prisma.contact.findUnique({ where: { id: contact.id } });

    await this.advanceFromNode(
      { ...updatedSession, variables } as any,
      currentNode,
      flowData.edges || [],
      flowData.nodes,
      refreshedContact || contact,
      messageData,
      routeHandle,
    );
  }

  // ─── Node Dispatcher ─────────────────────────────────────────────────────

  public async executeNode(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    this.logger.debug(`Executing node type=${node.type} id=${node.id}`);
    try {
      // Execute generic node actions BEFORE executing the node's main logic
      await this.executeNodeActions(contact, node);

      switch (node.type) {
        case 'sendData':       return await this.handleSendData(session, node, edges, allNodes, contact, messageData);
        case 'sendText':       return await this.handleSendText(session, node, edges, allNodes, contact, messageData);
        case 'sendContact':    return await this.handleSendContact(session, node, edges, allNodes, contact, messageData);
        case 'sendLocation':   return await this.handleSendLocation(session, node, edges, allNodes, contact, messageData);
        case 'sendCTAButton':  return await this.handleSendCTAButton(session, node, edges, allNodes, contact, messageData);
        case 'sendFlow':       return await this.handleSendFlow(session, node, edges, allNodes, contact, messageData);
        case 'sendCarousel':   return await this.handleSendCarousel(session, node, edges, allNodes, contact, messageData);
        case 'sendCallRequest': return await this.handleSendCallRequest(session, node, edges, allNodes, contact, messageData);
        case 'sendButton':     return await this.handleSendButton(session, node, edges, allNodes, contact, messageData);
        case 'sendList':       return await this.handleSendList(session, node, edges, allNodes, contact, messageData);
        case 'sendListAdvanced': return await this.handleSendListAdvanced(session, node, edges, allNodes, contact, messageData);
        case 'sendMedia':      return await this.handleSendMedia(session, node, edges, allNodes, contact, messageData);
        case 'sendTemplate':   return await this.handleSendTemplate(session, node, edges, allNodes, contact, messageData);
        case 'sendPayment':    return await this.handleSendPayment(session, node, edges, allNodes, contact, messageData);
        case 'interactive':    return await this.handleInteractive(session, node, edges, allNodes, contact, messageData);
        case 'productSearch':  return await this.handleProductSearch(session, node, edges, allNodes, contact, messageData);
        case 'productCategorization': return await this.handleProductCategorization(session, node, edges, allNodes, contact, messageData);
        case 'askText':        return await this.handleAskText(session, node, edges, allNodes, contact, messageData);
        case 'askNumber':      return await this.handleAskNumber(session, node, edges, allNodes, contact, messageData);
        case 'askDate':        return await this.handleAskDate(session, node, edges, allNodes, contact, messageData);
        case 'askEmail':       return await this.handleAskEmail(session, node, edges, allNodes, contact, messageData);
        case 'askLocation':    return await this.handleAskLocation(session, node, edges, allNodes, contact, messageData);
        case 'askAddress':     return await this.handleAskAddress(session, node, edges, allNodes, contact, messageData);
        case 'askImage':       return await this.handleAskImage(session, node, edges, allNodes, contact, messageData);
        case 'askVideo':       return await this.handleAskVideo(session, node, edges, allNodes, contact, messageData);
        case 'askAudio':       return await this.handleAskAudio(session, node, edges, allNodes, contact, messageData);
        case 'askFile':        return await this.handleAskFile(session, node, edges, allNodes, contact, messageData);
        case 'askQuestion':    return await this.handleAskQuestion(session, node, edges, allNodes, contact, messageData);
        case 'delay':          return await this.handleDelay(session, node, edges, allNodes, contact, messageData);
        case 'condition':      return await this.handleCondition(session, node, edges, allNodes, contact, messageData);
        case 'jumpTo':         return await this.handleJumpTo(session, node, edges, allNodes, contact, messageData);
        case 'updateField':    return await this.handleUpdateField(session, node, edges, allNodes, contact, messageData);
        case 'updateLabel':    return await this.handleUpdateLabel(session, node, edges, allNodes, contact, messageData);
        case 'updateSubscription': return await this.handleUpdateSubscription(session, node, edges, allNodes, contact, messageData);
        case 'assignTeam':     return await this.handleAssignTeam(session, node, edges, allNodes, contact, messageData);
        case 'assignSequence': return await this.handleAssignSequence(session, node, edges, allNodes, contact, messageData);
        case 'removeSequence': return await this.handleRemoveSequence(session, node, edges, allNodes, contact, messageData);
        case 'resolveConversation': return await this.handleResolveConversation(session, node);
        case 'httpApi':        return await this.handleHttpApi(session, node, edges, allNodes, contact, messageData);
        case 'detectCountry':  return await this.handleDetectCountry(session, node, edges, allNodes, contact, messageData);
        case 'aiResponse':     return await this.handleAiResponse(session, node, edges, allNodes, contact, messageData);
        case 'workingHours':   return await this.handleWorkingHours(session, node, edges, allNodes, contact, messageData);
        case 'inputFlow': {
          const inputType = node.data?.config?.inputType || 'TEXT';
          if (inputType === 'NUMBER') return await this.handleAskNumber(session, node, edges, allNodes, contact, messageData);
          if (inputType === 'DATE') return await this.handleAskDate(session, node, edges, allNodes, contact, messageData);
          if (inputType === 'IMAGE') return await this.handleAskImage(session, node, edges, allNodes, contact, messageData);
          if (inputType === 'FILE') return await this.handleAskFile(session, node, edges, allNodes, contact, messageData);
          if (inputType === 'LOCATION') return await this.handleAskLocation(session, node, edges, allNodes, contact, messageData);
          return await this.handleAskText(session, node, edges, allNodes, contact, messageData);
        }
        case 'triggerNode':
        default:
          // Structural / unknown nodes — just advance
          return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
      }
    } catch (err: any) {
      this.logger.error(`Node execution error [${node.type}:${node.id}]: ${err.message}`);
      // On error, try to advance so the flow doesn't get stuck
      await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
    }
  }

  // ─── Universal Node Actions ──────────────────────────────────────────────
  
  private async executeNodeActions(contact: Contact, node: FlowNode) {
    const nodeActions = node.data?.config?.nodeActions;
    if (!nodeActions) return;

    let updateData: any = {};
    let shouldUpdate = false;

    // 1. Tags / Labels
    const currentTags = contact.tags || [];
    let newTags = [...currentTags];
    
    if (nodeActions.addTags?.length) {
      for (const tag of nodeActions.addTags) {
        if (!newTags.includes(tag)) newTags.push(tag);
      }
    }
    
    if (nodeActions.removeTags?.length) {
      newTags = newTags.filter(tag => !nodeActions.removeTags.includes(tag));
    }

    if (newTags.length !== currentTags.length || !newTags.every((val, index) => val === currentTags[index])) {
      updateData.tags = newTags;
      shouldUpdate = true;
    }

    // 2. Assign Team Member
    if (nodeActions.assignTo && nodeActions.assignTo !== contact.agentId) {
      updateData.agentId = nodeActions.assignTo;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      try {
        await this.prisma.contact.update({
          where: { id: contact.id },
          data: updateData
        });
        // Mutate the local contact object so downstream functions have the latest state
        if (updateData.tags) contact.tags = updateData.tags;
        if (updateData.agentId) contact.agentId = updateData.agentId;
        this.logger.debug(`Executed nodeActions for node ${node.id} on contact ${contact.id}`);
      } catch (err: any) {
        this.logger.error(`Failed to execute nodeActions on contact ${contact.id}: ${err.message}`);
      }
    }
  }

  // ─── Helper for Sending and Tracking Bot Messages ──────────────────────────

  /**
   * Sends a message via WhatsApp and ensures the created record has the real Meta ID (waMessageId).
   * This is critical for read receipts to work.
   */
  private async sendBotMessageAndTrack(
    session: ChatbotSession, 
    contact: Contact, 
    type: MessageType, 
    content: any, 
    sendFn: () => Promise<any>
  ) {
    // 1. Pre-create the message record so it appears in the UI instantly
    const message = await this.messagingService.createMessage({
      organizationId: session.organizationId,
      whatsappAccountId: session.accountId,
      contactId: contact.id,
      direction: 'OUTBOUND' as any,
      type: type as any,
      content,
      metadata: { isChatbot: true, chatbotId: session.chatbotId },
      sentAt: new Date(),
    });

    try {
      // 2. Execute the actual WhatsApp API call
      const response = await sendFn();
      const waMessageId = response?.messages?.[0]?.id;

      if (waMessageId && message?.id) {
        // 3. Update with real Meta ID for read receipts
        const updatedMsg = await this.prisma.message.update({
          where: { id: message.id },
          data: { waMessageId }
        });
        
        // 4. Trigger UI update so it knows this message is now tracked by Meta
        this.messagingService.emitMessageStatus(session.organizationId, updatedMsg);
      }
      return response;
    } catch (err: any) {
      this.logger.error(`Failed to send bot message: ${err.message}`);
      throw err;
    }
  }

  // ─── Node Handlers ───────────────────────────────────────────────────────

  private async handleSendText(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    let text = await this.resolveVariables(config.text || '', session, contact, messageData);
    if (text) {
      // 1. Log and Emit to UI (Pre-create message record)
      const message = await this.messagingService.createMessage({
        organizationId: session.organizationId,
        whatsappAccountId: session.accountId,
        contactId: contact.id,
        direction: 'OUTBOUND' as any,
        type: 'TEXT' as any,
        content: { body: text },
        metadata: { isChatbot: true },
        sentAt: new Date(),
      });

      // 2. Send to WhatsApp and capture the real Meta ID (WAMID)
      const response = await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, text);
      const waMessageId = response?.messages?.[0]?.id;

      if (waMessageId && message?.id) {
        // 3. Link the ID so read receipts work
        await this.prisma.message.update({
          where: { id: message.id },
          data: { waMessageId }
        });
      }
    }
    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleSendData(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const dataType = config.dataType || 'TEXT';

    try {
      if (dataType === 'TEXT') {
        const text = await this.resolveVariables(config.text || '', session, contact, messageData);
        if (text) {
          await this.sendBotMessageAndTrack(
            session, contact, 'TEXT' as any, { body: text },
            () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, text)
          );
        }
      } else if (['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'].includes(dataType)) {
        let mediaUrl = config.mediaUrl;
        if (config.uploadMethod === 'VARIABLE' && config.mediaVariable) {
          mediaUrl = await this.resolveVariables(config.mediaVariable, session, contact, messageData);
        }
        
        if (mediaUrl) {
          let type: MessageType = 'IMAGE' as any;
          if (dataType === 'VIDEO') type = 'VIDEO' as any;
          if (dataType === 'AUDIO') type = 'AUDIO' as any;
          if (dataType === 'DOCUMENT') type = 'DOCUMENT' as any;

          await this.sendBotMessageAndTrack(
            session, contact, type, { link: mediaUrl },
            async () => this.whatsappService.sendMediaByUrl(
              session.organizationId, 
              session.accountId, 
              contact.phone, 
              type.toLowerCase() as 'image' | 'video' | 'audio' | 'document', 
              mediaUrl as string, 
              await this.resolveVariables(config.caption || '', session, contact, messageData),
              await this.resolveVariables(config.mediaFilename || '', session, contact, messageData)
            )
          );
        }
      } else if (dataType === 'LOCATION') {
        const locationData = {
          latitude: parseFloat(await this.resolveVariables(config.latitude || '0', session, contact, messageData)),
          longitude: parseFloat(await this.resolveVariables(config.longitude || '0', session, contact, messageData)),
          name: config.locationName ? await this.resolveVariables(config.locationName, session, contact, messageData) : undefined,
          address: config.address ? await this.resolveVariables(config.address, session, contact, messageData) : undefined,
        };
        if (locationData.latitude && locationData.longitude) {
          await this.sendBotMessageAndTrack(
            session, contact, 'LOCATION' as any, locationData,
            () => this.whatsappService.sendLocationMessage(session.organizationId, session.accountId, contact.phone, locationData)
          );
        }
      } else if (dataType === 'CONTACT') {
         const contactData = {
           firstName: await this.resolveVariables(config.contactFirstName || '', session, contact, messageData),
           lastName: await this.resolveVariables(config.contactLastName || '', session, contact, messageData),
           phone: await this.resolveVariables(config.contactPhone || '', session, contact, messageData),
           email: await this.resolveVariables(config.contactEmail || '', session, contact, messageData),
           organization: await this.resolveVariables(config.contactOrg || '', session, contact, messageData),
           website: await this.resolveVariables(config.contactWebsite || '', session, contact, messageData),
         };
         if (contactData.firstName && contactData.phone) {
           await this.sendBotMessageAndTrack(
             session, contact, 'CONTACT' as any, { contacts: [contactData] },
             () => this.whatsappService.sendContactMessage(session.organizationId, session.accountId, contact.phone, [contactData])
           );
         }
      } else if (dataType === 'CAROUSEL') {
         const body = await this.resolveVariables(config.carouselBody || '', session, contact, messageData);
         const cards: any[] = [];
         if (config.cards?.length) {
           for (const c of config.cards) {
             const cardBody = c.bodyText ? await this.resolveVariables(c.bodyText, session, contact, messageData) : undefined;
             let mediaUrl = c.mediaUrl;
             if (c.mediaMethod === 'VARIABLE' && c.mediaVariable) {
                mediaUrl = await this.resolveVariables(c.mediaVariable, session, contact, messageData);
             }
             const buttons = [{
               type: config.carouselButtonType === 'URL' ? 'url' : 'reply',
               label: await this.resolveVariables(c.buttonLabel || 'Action', session, contact, messageData),
               url: config.carouselButtonType === 'URL' ? await this.resolveVariables(c.buttonValue || '', session, contact, messageData) : undefined,
               id: config.carouselButtonType !== 'URL' ? c.buttonValue : undefined
             }];
             cards.push({ headerType: c.headerType?.toLowerCase() || 'image', headerUrl: mediaUrl, body: cardBody, buttons });
           }
           await this.sendBotMessageAndTrack(
             session, contact, 'INTERACTIVE' as any, { body, cards },
             () => this.whatsappService.sendCarouselMessage(session.organizationId, session.accountId, contact.phone, { body, cards })
           );
         }
      }
    } catch (err: any) {
      this.logger.error(`SendData error [${dataType}]: ${err.message}`, err.stack);
    }

    // Handle Delay if any
    let totalDelayMs = 0;
    if (config.delayHours) totalDelayMs += config.delayHours * 60 * 60 * 1000;
    if (config.delayMinutes) totalDelayMs += config.delayMinutes * 60 * 1000;
    if (config.delaySeconds) totalDelayMs += config.delaySeconds * 1000;

    if (totalDelayMs > 0) {
      let outEdges = edges.filter(e => e.source === node.id);
      const specific = outEdges.filter(e => e.sourceHandle === 'output');
      outEdges = specific.length > 0 ? specific : outEdges.filter(e => !e.sourceHandle);
      
      if (outEdges.length > 0) {
        const nextNodeId = outEdges[0].target;
        await this.prisma.chatbotSession.update({
          where: { id: session.id },
          data: { 
            status: ChatbotSessionStatus.WAITING_REPLY,
            waitingForInput: false,
            currentNodeId: node.id,
            expiresAt: new Date(Date.now() + totalDelayMs)
          },
        });
        await this.delayQueue.add('resume-after-delay', {
          sessionId: session.id,
          nextNodeId,
          organizationId: session.organizationId,
          accountId: session.accountId,
          contactId: contact.id
        }, { delay: totalDelayMs });
      } else {
        await this.markCompleted(session.id);
      }
      return;
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleInteractive(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const intType = config.interactiveType || 'BUTTONS';
    
    // Resolve basic variables
    const headerContent = config.headerContent ? await this.resolveVariables(config.headerContent, session, contact, messageData) : undefined;
    const bodyText = config.bodyText ? await this.resolveVariables(config.bodyText, session, contact, messageData) : '';
    const footerText = config.footerText ? await this.resolveVariables(config.footerText, session, contact, messageData) : undefined;

    let payload: any = null;

    if (intType === 'BUTTONS') {
      const buttons = await Promise.all((config.buttons || []).map(async (b: any) => ({
        type: 'reply',
        reply: { id: b.postbackId || b.id, title: await this.resolveVariables(b.text || '', session, contact, messageData) }
      })));
      payload = { type: 'button', body: { text: bodyText }, action: { buttons } };
      if (footerText) payload.footer = { text: footerText };
      if (config.headerType && config.headerType !== 'NONE') {
        payload.header = { type: config.headerType.toLowerCase() };
        payload.header[config.headerType.toLowerCase()] = { [config.headerType === 'TEXT' ? 'text' : 'link']: headerContent };
      }
    } else if (intType === 'LIST') {
      const buttonText = await this.resolveVariables(config.listButtonText || 'Menu', session, contact, messageData);
      
      // Graph Traversal for List Sections and Rows
      const sections: any[] = [];
      const outEdges = edges.filter(e => e.source === node.id);
      
      for (const edge of outEdges) {
        const targetNode = allNodes.find(n => n.id === edge.target);
        if (targetNode && targetNode.type === 'listSection') {
          const sectionTitle = await this.resolveVariables(targetNode.data?.config?.sectionTitle || 'Section', session, contact, messageData);
          const rows: any[] = [];
          
          const sectionOutEdges = edges.filter(e => e.source === targetNode.id);
          for (const secEdge of sectionOutEdges) {
            const rowNode = allNodes.find(n => n.id === secEdge.target);
            if (rowNode && rowNode.type === 'listRow') {
               const rConfig = rowNode.data?.config || {};
               rows.push({
                 id: rConfig.rowId || rowNode.id,
                 title: await this.resolveVariables(rConfig.rowTitle || 'Row', session, contact, messageData),
                 description: rConfig.rowDescription ? await this.resolveVariables(rConfig.rowDescription, session, contact, messageData) : undefined
               });
            }
          }
          
          if (rows.length > 0) {
            sections.push({ title: sectionTitle, rows: rows.slice(0, 10) }); // Max 10 rows per section
          }
        }
      }

      payload = { type: 'list', body: { text: bodyText }, action: { button: buttonText, sections: sections.slice(0, 10) } }; // Max 10 sections
      if (footerText) payload.footer = { text: footerText };
      if (config.headerType === 'TEXT' && headerContent) payload.header = { type: 'text', text: headerContent };
    } else if (intType === 'CTA') {
      const b = (config.ctaButtons || [])[0];
      if (b) {
        const label = await this.resolveVariables(b.label || '', session, contact, messageData);
        const value = await this.resolveVariables(b.value || '', session, contact, messageData);
        
        let actionName = 'cta_url';
        let parameters: any = { display_text: label, url: value };
        
        if (b.type === 'COPY') {
          actionName = 'copy_code';
          parameters = { display_text: label, coupon_code: value };
        } else if (b.type === 'PHONE') {
          actionName = 'cta_call';
          parameters = { display_text: label, phone_number: value };
        }

        // Meta requires the interactive type to match the action name (e.g. cta_url)
        payload = { 
          type: actionName, 
          body: { text: bodyText }, 
          action: { name: actionName, parameters } 
        };

        if (footerText) payload.footer = { text: footerText };
        if (config.headerType && config.headerType !== 'NONE') {
          payload.header = { type: config.headerType.toLowerCase() };
          payload.header[config.headerType.toLowerCase()] = { [config.headerType === 'TEXT' ? 'text' : 'link']: headerContent };
        }
      }
    } else if (intType === 'LOCATION') {
      payload = { type: 'location_request_message', body: { text: bodyText }, action: { name: 'send_location' } };
    } else if (intType === 'CATALOG') {
      if (config.catalogType === 'MULTI') {
         payload = { type: 'catalog_message', body: { text: bodyText }, action: { name: 'catalog_message', parameters: { thumbnail_product_retailer_id: config.productIds?.[0] } } };
      } else {
         payload = { type: 'product', body: { text: bodyText }, action: { catalog_id: config.catalogId, product_retailer_id: config.productIds?.[0] } };
      }
      if (footerText) payload.footer = { text: footerText };
    }

    if (payload) {
      try {
        await this.sendBotMessageAndTrack(
          session, contact, 'INTERACTIVE' as any, { body: bodyText, interactive: payload },
          () => this.whatsappService.sendInteractiveMessage(session.organizationId, session.accountId, contact.phone, payload)
        );
      } catch (err: any) {
        this.logger.error(`handleInteractive Error: ${err.message}`);
      }
    }

    // If the interactive type requires a user response, we must pause execution here.
    if (intType === 'BUTTONS' || intType === 'LIST' || intType === 'LOCATION') {
      const waitingNodeType = intType === 'BUTTONS' ? 'button' : intType === 'LIST' ? 'list' : 'askLocation';
      await this.prisma.chatbotSession.update({
        where: { id: session.id },
        data: {
          status: ChatbotSessionStatus.WAITING_REPLY,
          waitingForInput: true,
          waitingNodeType: waitingNodeType,
          currentNodeId: node.id,
        },
      });
      return; // Stop execution; handleIncomingMessage will resume via handles (e.g. btn_XYZ)
    }

    // For non-blocking interactive types (like CTA URLs or Catalogs), apply standard delay and advance
    const delayHours = config.delayHours || 0;
    const delayMinutes = config.delayMinutes || 0;
    const delaySeconds = config.delaySeconds || 0;
    const totalDelayMs = (delayHours * 3600 + delayMinutes * 60 + delaySeconds) * 1000;
    const outEdges = edges.filter(e => e.source === node.id);

    if (totalDelayMs > 0) {
      if (outEdges.length > 0) {
        await this.prisma.chatbotSession.update({
          where: { id: session.id },
          data: { status: ChatbotSessionStatus.WAITING_REPLY, waitingForInput: false, currentNodeId: node.id, expiresAt: new Date(Date.now() + totalDelayMs) },
        });
        await this.delayQueue.add('resume-after-delay', { sessionId: session.id, nextNodeId: outEdges[0].target, organizationId: session.organizationId, accountId: session.accountId, contactId: contact.id }, { delay: totalDelayMs });
      } else {
        await this.markCompleted(session.id);
      }
      return;
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleSendContact(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    const contactData = {
      firstName: await this.resolveVariables(config.firstName || '', session, contact, messageData),
      lastName: await this.resolveVariables(config.lastName || '', session, contact, messageData),
      phone: await this.resolveVariables(config.phone || '', session, contact, messageData),
      email: await this.resolveVariables(config.email || '', session, contact, messageData),
      organization: await this.resolveVariables(config.organization || '', session, contact, messageData),
      website: await this.resolveVariables(config.website || '', session, contact, messageData),
    };

    if (contactData.firstName && contactData.phone) {
      try {
        await this.whatsappService.sendContactMessage(
          session.organizationId, 
          session.accountId, 
          contact.phone, 
          [contactData]
        );
      } catch (err: any) {
        this.logger.error(`SendContact error: ${err.message}`);
      }
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleSendLocation(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    const locationData = {
      latitude: parseFloat(await this.resolveVariables(config.latitude || '0', session, contact, messageData)),
      longitude: parseFloat(await this.resolveVariables(config.longitude || '0', session, contact, messageData)),
      name: config.name ? await this.resolveVariables(config.name, session, contact, messageData) : undefined,
      address: config.address ? await this.resolveVariables(config.address, session, contact, messageData) : undefined,
    };

    if (locationData.latitude && locationData.longitude) {
      try {
        await this.whatsappService.sendLocationMessage(
          session.organizationId, 
          session.accountId, 
          contact.phone, 
          locationData
        );
      } catch (err: any) {
        this.logger.error(`SendLocation error: ${err.message}`);
      }
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'notSubmitted');
  }

  private async handleSendCarousel(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    const body = await this.resolveVariables(config.body || 'Check out these options:', session, contact, messageData);
    const cards: any[] = [];

    if (config.cards?.length) {
      for (const c of config.cards) {
        const cardBody = c.body ? await this.resolveVariables(c.body, session, contact, messageData) : undefined;
        const headerUrl = await this.resolveVariables(c.headerUrl || '', session, contact, messageData);
        
        const buttons = await Promise.all((c.buttons || []).map(async (b: any) => ({
          ...b,
          label: await this.resolveVariables(b.label || '', session, contact, messageData),
          url: b.type === 'url' ? await this.resolveVariables(b.url || '', session, contact, messageData) : undefined
        })));

        cards.push({
          headerType: c.headerType || 'image',
          headerUrl,
          body: cardBody,
          buttons
        });
      }

      try {
        await this.whatsappService.sendCarouselMessage(
          session.organizationId, 
          session.accountId, 
          contact.phone, 
          { body, cards }
        );

        const hasQuickReply = config.cards.some((c: any) => (c.buttons || []).some((b: any) => b.type === 'reply'));
        
        if (hasQuickReply) {
          await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
              status: ChatbotSessionStatus.WAITING_REPLY,
              waitingForInput: true,
              waitingNodeType: 'carousel',
              currentNodeId: node.id,
            },
          });
        } else {
           await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
        }
      } catch (err: any) {
        this.logger.error(`SendCarousel error: ${err.message}`);
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
      }
    } else {
       await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
  }

  private async handleSendCTAButton(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    const body = await this.resolveVariables(config.body || 'Click the button below:', session, contact, messageData);
    const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
    const header = config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined;
    const buttonLabel = await this.resolveVariables(config.buttonLabel || 'Learn More', session, contact, messageData);
    const url = await this.resolveVariables(config.url || '', session, contact, messageData);

    if (url) {
      try {
        await this.whatsappService.sendCTAButtonMessage(
          session.organizationId, 
          session.accountId, 
          contact.phone, 
          { body, footer, header, buttonLabel, url }
        );
      } catch (err: any) {
        this.logger.error(`SendCTAButton error: ${err.message}`);
      }
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleSendFlow(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    const body = await this.resolveVariables(config.body || 'Please complete the form:', session, contact, messageData);
    const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
    const flowCta = await this.resolveVariables(config.flowCta || 'Open Form', session, contact, messageData);
    const flowToken = uuidv4(); // Unique token for this form session

    if (config.flowId) {
      try {
        await this.whatsappService.sendFlowMessage(
          session.organizationId, 
          session.accountId, 
          contact.phone, 
          { 
            body, 
            footer, 
            flowId: config.flowId, 
            flowToken, 
            flowCta, 
            flowMode: config.flowMode,
            screen: config.screen,
            payload: config.payload
          }
        );

        // Update session to wait for flow submission
        await this.prisma.chatbotSession.update({
          where: { id: session.id },
          data: {
            status: ChatbotSessionStatus.WAITING_REPLY,
            waitingForInput: true,
            waitingNodeType: 'flow',
            currentNodeId: node.id,
            metadata: { 
                ...(session.metadata as any) || {}, 
                lastFlowToken: flowToken,
                flowId: config.flowId
            }
          },
        });
      } catch (err: any) {
        this.logger.error(`SendFlow error: ${err.message}`);
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'notSubmitted');
      }
    } else {
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'notSubmitted');
    }
  }

  private async handleSendCallRequest(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    const body = await this.resolveVariables(config.body || 'We would like to call you to help with your query.', session, contact, messageData);
    const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;

    try {
      await this.whatsappService.sendCallRequestMessage(
        session.organizationId, 
        session.accountId, 
        contact.phone, 
        { body, footer }
      );

      await this.prisma.chatbotSession.update({
        where: { id: session.id },
        data: {
          status: ChatbotSessionStatus.WAITING_REPLY,
          waitingForInput: true,
          waitingNodeType: 'callRequest',
          currentNodeId: node.id,
        },
      });
    } catch (err: any) {
      this.logger.error(`SendCallRequest error: ${err.message}`);
      await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
  }

  private async handleAskText(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || 'Please enter your text:', session, contact, messageData);
    
    if (question) {
      await this.sendBotMessageAndTrack(
        session, contact, 'TEXT' as any, { body: question },
        () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
      );
    }
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askText',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskNumber(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || 'Please enter a number:', session, contact, messageData);
    
    if (question) {
      await this.sendBotMessageAndTrack(
        session, contact, 'TEXT' as any, { body: question },
        () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
      );
    }
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askNumber',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskDate(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || 'Please enter a date:', session, contact, messageData);
    
    if (question) {
      await this.sendBotMessageAndTrack(
        session, contact, 'TEXT' as any, { body: question },
        () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
      );
    }
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askDate',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskEmail(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || 'Please enter your email address:', session, contact, messageData);
    
    if (question) {
      await this.sendBotMessageAndTrack(
        session, contact, 'TEXT' as any, { body: question },
        () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
      );
    }
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askEmail',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskLocation(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || 'Please share your location:', session, contact, messageData);
    
    if (question) {
      await this.sendBotMessageAndTrack(
        session, contact, 'TEXT' as any, { body: question },
        () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
      );
    }
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askLocation',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskAddress(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const bodyText = await this.resolveVariables(config.question || config.text || 'Please provide your address:', session, contact, messageData);
    
    await this.sendBotMessageAndTrack(
      session, contact, 'TEXT' as any, { body: bodyText },
      () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, bodyText)
    );
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askAddress',
        currentNodeId: node.id,
      },
    });
  }

  private async handleAskImage(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || config.text || 'Please upload an image:', session, contact, messageData);
    
    await this.sendBotMessageAndTrack(
      session, contact, 'TEXT' as any, { body: question },
      () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
    );
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askImage',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskVideo(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || config.text || 'Please upload a video:', session, contact, messageData);
    
    await this.sendBotMessageAndTrack(
      session, contact, 'TEXT' as any, { body: question },
      () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
    );
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askVideo',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskAudio(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || config.text || 'Please send your voice message:', session, contact, messageData);
    
    await this.sendBotMessageAndTrack(
      session, contact, 'TEXT' as any, { body: question },
      () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
    );
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askAudio',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskFile(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || config.text || 'Please upload the requested file:', session, contact, messageData);
    
    await this.sendBotMessageAndTrack(
      session, contact, 'TEXT' as any, { body: question },
      () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
    );
    
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'askFile',
        currentNodeId: node.id,
        metadata: {
          ...(session.metadata as any) || {},
          currentAttempt: 0
        }
      },
    });
  }

  private async handleAskQuestion(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || config.text || '', session, contact, messageData);
    if (question) {
      await this.sendBotMessageAndTrack(
        session, contact, 'TEXT' as any, { body: question },
        () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question)
      );
    }
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'ask',
        currentNodeId: node.id,
      },
    });
  }

  private async handleSendButton(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const bodyText = await this.resolveVariables(config.body || config.text || 'Please choose an option:', session, contact, messageData);
    const headerText = config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined;
    const footerText = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
    const buttons: Array<{ id: string; title: string }> = (config.buttons || []).slice(0, 3).map((b: any) => ({
      id: b.postbackId || b.id || b.payload || b.title,
      title: b.title || b.label,
    }));

    if (buttons.length > 0) {
      await this.sendBotMessageAndTrack(
        session, contact, 'INTERACTIVE' as any, { body: bodyText, buttons },
        () => this.whatsappService.sendInteractiveButtons(
          session.organizationId, session.accountId, contact.phone,
          bodyText, buttons, headerText, footerText,
        )
      );
    }

    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'button',
        currentNodeId: node.id,
      },
    });
  }

  private async handleSendList(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const bodyText = await this.resolveVariables(config.body || 'Please select an option:', session, contact, messageData);
    const buttonText = config.buttonText || 'View Options';
    const headerText = config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined;
    const footerText = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;

    const sections = (config.sections || []).map((s: any) => ({
      title: s.title || 'Options',
      rows: (s.rows || s.items || []).map((r: any) => ({
        id: r.id || r.payload || r.title,
        title: r.title,
        description: r.description,
      })),
    }));

    if (sections.length > 0) {
      await this.sendBotMessageAndTrack(
        session, contact, 'INTERACTIVE' as any, { body: bodyText, sections },
        () => this.whatsappService.sendInteractiveList(
          session.organizationId, session.accountId, contact.phone,
          bodyText, buttonText, sections, headerText, footerText,
        )
      );
    }

    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: true,
        waitingNodeType: 'list',
        currentNodeId: node.id,
      },
    });
  }

  private async handleSendListAdvanced(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const bodyText = await this.resolveVariables(config.body || 'Please select an option:', session, contact, messageData);
    const buttonText = config.buttonText || 'View Options';
    const sectionTitle = config.sectionTitle || 'Options';

    try {
      // 1. Resolve and Execute API Request
      const url = await this.resolveVariables(config.apiUrl || '', session, contact, messageData);
      const method = config.method || 'GET';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      (config.headers || []).forEach((h: any) => { headers[h.key] = h.value; });

      const response = await axios({
        method,
        url,
        headers,
        data: method !== 'GET' ? config.bodyData : undefined,
        params: config.params
      });

      const data = response.data;
      
      // 2. Map Items from Response
      const itemsPath = config.itemsPath || '';
      const items = itemsPath ? this.getValueByPath(data, itemsPath) : data;

      if (!Array.isArray(items)) {
         this.logger.warn(`SendListAdvanced: Items at path "${itemsPath}" is not an array.`);
         return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
      }

      const rows = items.slice(0, 10).map((item: any) => ({
        id: String(this.getValueByPath(item, config.optionIdPath || 'id') || uuidv4()),
        title: String(this.getValueByPath(item, config.optionTitlePath || 'name') || 'Option').substring(0, 24),
        description: config.optionDescPath ? String(this.getValueByPath(item, config.optionDescPath) || '').substring(0, 72) : undefined
      }));

      // 3. Send List
      if (rows.length > 0) {
        await this.whatsappService.sendInteractiveList(
          session.organizationId, session.accountId, contact.phone,
          bodyText, buttonText, [{ title: sectionTitle, rows }], 
          config.header, config.footer
        );
      }

      // 4. Update Session to wait for reply
      await this.prisma.chatbotSession.update({
        where: { id: session.id },
        data: {
          status: ChatbotSessionStatus.WAITING_REPLY,
          waitingForInput: true,
          waitingNodeType: 'listAdvanced',
          currentNodeId: node.id,
          // Store the original API response in metadata for mapping later if needed
          metadata: { ...(session.metadata as any) || {}, lastAdvancedListItems: items }
        },
      });

    } catch (err: any) {
      this.logger.error(`SendListAdvanced API error: ${err.message}`);
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
  }

  private getValueByPath(obj: any, path: string) {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  private async handleSendMedia(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const mediaType: 'image' | 'video' | 'document' | 'audio' = config.mediaType || 'image';
    const caption = config.caption ? await this.resolveVariables(config.caption, session, contact, messageData) : undefined;

    if (config.mediaUrl) {
      await this.whatsappService.sendMediaByUrl(
        session.organizationId, session.accountId, contact.phone,
        mediaType, config.mediaUrl, caption, config.filename,
      );
    } else if (config.mediaId) {
      const typeMap: any = { image: 'IMAGE', video: 'VIDEO', document: 'DOCUMENT', audio: 'AUDIO' };
      await this.whatsappService.sendMediaMessage(
        session.organizationId, session.accountId, contact.phone,
        typeMap[mediaType], config.mediaId, caption,
      );
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleSendTemplate(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    if (!config.templateName) {
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
    }

    const components: any[] = [];

    // 1. Resolve Header Params
    if (config.headerParams?.length) {
      const params = await Promise.all(
        config.headerParams.map(async (p: any) => {
          const type = p.type || 'text';
          if (type === 'text') {
            return { type: 'text', text: await this.resolveVariables(p.text || '', session, contact, messageData) };
          } else if (['image', 'video', 'document'].includes(type)) {
            return {
              type: type,
              [type]: {
                link: await this.resolveVariables(p.link || '', session, contact, messageData),
              },
            };
          }
          return null;
        }),
      );
      const filtered = params.filter(Boolean);
      if (filtered.length) {
        components.push({ type: 'header', parameters: filtered });
      }
    }

    // 2. Resolve Body Params
    if (config.bodyParams?.length) {
      const params = await Promise.all(
        config.bodyParams.map(async (p: string) => ({
          type: 'text',
          text: await this.resolveVariables(p, session, contact, messageData),
        })),
      );
      components.push({ type: 'body', parameters: params });
    }

    // 3. Resolve Button Params (URL Buttons)
    if (config.buttons?.length) {
      config.buttons.forEach(async (btn: any, index: number) => {
        if (btn.type === 'url' && btn.dynamic) {
          components.push({
            type: 'button',
            sub_type: 'url',
            index: String(index),
            parameters: [
              {
                type: 'text',
                text: await this.resolveVariables(btn.suffix || '', session, contact, messageData),
              },
            ],
          });
        }
      });
    }

    await this.sendBotMessageAndTrack(
      session, contact, 'TEMPLATE' as any, { templateName: config.templateName, name: config.templateName, language: config.language || 'en_US', components },
      () => this.whatsappService.sendTemplateMessage(
        session.organizationId,
        session.accountId,
        contact.phone,
        config.templateName,
        config.language || 'en_US',
        components,
      )
    );

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleSendPayment(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    // 1. Resolve Amount and Currency
    const rawAmount = config.amountType === 'field' 
      ? await this.resolveVariables(config.amountField || '', session, contact, messageData)
      : config.amountValue;
    const amount = parseFloat(rawAmount || '0');

    // 2. Resolve Reference ID
    let referenceId = '';
    if (config.referenceType === 'field') {
      referenceId = await this.resolveVariables(config.referenceField || '', session, contact, messageData);
    } else {
      referenceId = `TX_${Date.now()}_${uuidv4().substring(0, 6)}`;
    }

    // 3. Resolve Body and Footer
    const body = await this.resolveVariables(config.body || 'Please complete your payment to proceed.', session, contact, messageData);
    const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;

    // 4. Razorpay Specifics
    const razorpayReceipt = config.razorpayReceipt ? await this.resolveVariables(config.razorpayReceipt, session, contact, messageData) : undefined;
    let razorpayNotes = {};
    if (config.razorpayNotes) {
      try {
        const resolvedNotes = await this.resolveVariables(config.razorpayNotes, session, contact, messageData);
        razorpayNotes = JSON.parse(resolvedNotes);
      } catch (e) {
        this.logger.warn(`Failed to parse Razorpay notes for node ${node.id}`);
      }
    }

    try {
      await this.whatsappService.sendPaymentMessage(
        session.organizationId,
        session.accountId,
        contact.phone,
        {
          body,
          footer,
          referenceId,
          amount,
          currency: config.currency || 'INR',
          gateway: config.gateway || 'razorpay',
          configId: config.configId,
          razorpayReceipt,
          razorpayNotes
        }
      );

      // 5. Update session to wait for payment status (via webhook) or expiry
      await this.prisma.chatbotSession.update({
        where: { id: session.id },
        data: {
          status: ChatbotSessionStatus.WAITING_REPLY,
          waitingForInput: true,
          waitingNodeType: 'payment',
          currentNodeId: node.id,
          metadata: {
            ...(session.metadata as any) || {},
            lastPaymentReference: referenceId,
            paymentAmount: amount
          }
        },
      });

      // 6. Handle Expiry (Native UPI needs at least 5 mins)
      const expiryMinutes = parseInt(config.expiryValue || '30', 10);
      const delayMs = expiryMinutes * 60 * 1000;
      
      await this.delayQueue.add(
        'payment-expiry',
        { sessionId: session.id, nextNodeId: node.id, type: 'payment_expiry' },
        { delay: delayMs }
      );

    } catch (err: any) {
      this.logger.error(`SendPayment error: ${err.message}`);
      await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'expired');
    }
  }

  private async handleProductSearch(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    // 1. Resolve Search Query
    const query = config.searchTextVar 
      ? await this.resolveVariables(config.searchTextVar, session, contact, messageData)
      : '';

    if (!query || !config.catalogId) {
      this.logger.warn(`ProductSearch node ${node.id} missing query or catalogId`);
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'noResults');
    }

    try {
      // 2. Search Products in Meta Catalog
      const products = await this.whatsappService.searchCatalogProducts(
        session.organizationId,
        session.accountId,
        config.catalogId,
        query,
        config.searchFields || ['name']
      );

      if (!products || products.length === 0) {
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'noResults');
      }

      // 3. Group by Categorization Method
      // WhatsApp allows up to 30 products total, and up to 10 sections.
      const sections: any[] = [];
      const MAX_TOTAL_PRODUCTS = 30;
      
      // Basic grouping logic by category
      const grouped: Record<string, string[]> = {};
      let totalCount = 0;

      for (const p of products) {
        if (totalCount >= MAX_TOTAL_PRODUCTS) break;
        
        const category = p.category || 'Results';
        if (!grouped[category]) grouped[category] = [];
        
        grouped[category].push(p.retailer_id);
        totalCount++;
      }

      for (const [title, pids] of Object.entries(grouped)) {
        sections.push({ title, products: pids });
      }

      // 4. Send Message
      await this.whatsappService.sendProductListMessage(
        session.organizationId,
        session.accountId,
        contact.phone,
        {
          catalogId: config.catalogId,
          body: await this.resolveVariables(config.body || `I found some products matching "${query}":`, session, contact, messageData),
          header: config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined,
          footer: config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined,
          sections: sections.slice(0, 10)
        }
      );

      await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    } catch (err: any) {
      this.logger.error(`ProductSearch error: ${err.message}`);
      await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'noResults');
    }
  }

  private async handleProductCategorization(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    if (!config.catalogId) {
      this.logger.warn(`ProductCategorization node ${node.id} missing catalogId`);
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
    }

    try {
      // 1. Fetch products (top 100 for categorization)
      const products = await this.whatsappService.searchCatalogProducts(
        session.organizationId,
        session.accountId,
        config.catalogId,
        '', 
        ['name']
      );

      // 2. Aggregate by Categorization Method
      const method = config.categorizationMethod || 'product_category';
      const aggregation: Record<string, number> = {};
      
      products.forEach((p: any) => {
        let value = 'Others';
        if (method === 'brand') value = p.brand || 'No Brand';
        else if (method === 'product_category') value = p.category || 'Uncategorized';
        else if (method === 'material') value = p.material || 'Standard';
        else if (method === 'pattern') value = p.pattern || 'Plain';
        
        aggregation[value] = (aggregation[value] || 0) + 1;
      });

      // 3. Construct List Sections
      const rows = Object.entries(aggregation).map(([label, count]) => ({
        id: `cat_${label}`,
        title: `${label} (${count})`,
        description: `View items in ${label}`
      })).slice(0, 10);

      const sections = [{
        title: 'Categories',
        rows
      }];

      // 4. Send Message
      const body = await this.resolveVariables(config.body || 'Select a category to browse:', session, contact, messageData);
      const footer = config.footer || 'Tap to view Categories details view items';
      
      await this.whatsappService.sendInteractiveList(
        session.organizationId,
        session.accountId,
        contact.phone,
        body,
        'View Categories',
        sections,
        config.header,
        footer
      );

      // 5. Transition to WAITING_REPLY
      await this.prisma.chatbotSession.update({
        where: { id: session.id },
        data: {
          status: ChatbotSessionStatus.WAITING_REPLY,
          waitingForInput: true,
          waitingNodeType: 'product_categorization',
          currentNodeId: node.id,
        },
      });

    } catch (err: any) {
      this.logger.error(`ProductCategorization error: ${err.message}`);
      await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
    }
  }

  private async handleDelay(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    
    // Support 'value' (from frontend) and fallback to 'amount' or 'delayAmount'
    const amount = parseInt(config.value || config.delayAmount || config.amount || '5', 10);
    
    // Support 'unit' (from frontend) and fallback to 'delayUnit'
    const unitStr = (config.unit || config.delayUnit || 'seconds').toLowerCase();

    const unitMs: Record<string, number> = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
    };
    
    const delayMs = amount * (unitMs[unitStr] || 1000);

    // Find the next node to advance to AFTER the delay
    const outEdge = edges.find(e => e.source === node.id);
    const nextNodeId = outEdge?.target;

    if (!nextNodeId) {
      return await this.markCompleted(session.id);
    }

    // Keep currentNodeId as the DELAY node itself during the wait
    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: false,
        currentNodeId: node.id,
        expiresAt: new Date(Date.now() + delayMs),
      },
    });

    await this.delayQueue.add(
      'resume-after-delay',
      { sessionId: session.id, nextNodeId, organizationId: session.organizationId, accountId: session.accountId, contactId: session.contactId },
      { delay: delayMs },
    );
  }

  private async handleCondition(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const conditions: any[] = config.conditions || [];
    const logicType: 'AND' | 'OR' = config.logicType || 'AND';

    const results = await Promise.all(conditions.map(c => this.evaluateCondition(c, session, contact, messageData)));

    const passed = logicType === 'AND' ? results.every(Boolean) : results.some(Boolean);
    
    // Try primary handle ('true'/'false'), but allow fallback to legacy 'success'/'fail'
    const handle = passed ? 'true' : 'false';
    const legacyHandle = passed ? 'success' : 'fail';

    // We'll peek at the edges. If 'true'/'false' doesn't exist but 'success'/'fail' does, use the legacy one.
    const hasPrimaryEdge = edges.some(e => e.source === node.id && e.sourceHandle === handle);
    const finalHandle = hasPrimaryEdge ? handle : legacyHandle;

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, finalHandle);
  }

  private async evaluateCondition(condition: any, session: ChatbotSession, contact: Contact, messageData: any): Promise<boolean> {
    const { source, operator, value, valueType } = condition;
    
    // Resolve the left-hand side (actual)
    let actual: string | null = null;
    if (source === 'Last Message Received') {
      actual = messageData.text?.body ?? messageData.interactive?.button_reply?.title ?? messageData.interactive?.list_reply?.title ?? '';
    } else if (source?.startsWith('custom.') || source === 'Contact/Custom Field') {
      const fieldKey = condition.fieldKey || source.replace('custom.', '');
      const customFields = (contact as any).customFields as Record<string, any> || {};
      actual = customFields[fieldKey] ?? null;
    } else if (source?.startsWith('var.')) {
      const varKey = source.replace('var.', '');
      actual = ((session.variables as any) || {})[varKey] ?? null;
    } else if (source === 'contact.firstName') {
      actual = contact.firstName ?? null;
    } else if (source === 'contact.email') {
      actual = contact.email ?? null;
    }

    if (actual === null && operator !== 'Is Empty') return false;
    
    // Resolve the right-hand side (expected value)
    let expected: string | null = value;
    if (valueType === 'Custom/Contact Field' && value) {
      if (value.startsWith('custom.')) {
        const fieldKey = value.replace('custom.', '');
        const customFields = (contact as any).customFields as Record<string, any> || {};
        expected = customFields[fieldKey] ?? null;
      } else if (value === 'contact.firstName') {
        expected = contact.firstName ?? null;
      } else if (value === 'contact.email') {
        expected = contact.email ?? null;
      } else if (value.startsWith('var.')) {
        const varKey = value.replace('var.', '');
        expected = ((session.variables as any) || {})[varKey] ?? null;
      }
    }

    const a = (actual ?? '').toLowerCase();
    const v = (expected ?? '').toLowerCase();

    switch (operator) {
      case 'Equals (=)':       return a === v;
      case 'Not Equals (!=)':  return a !== v;
      case 'Contains':         return a.includes(v);
      case 'Does Not Contain': return !a.includes(v);
      case 'Starts With':      return a.startsWith(v);
      case 'Ends With':        return a.endsWith(v);
      case 'Is Empty':         return !actual || actual.trim() === '';
      case 'Is Not Empty':     return !!actual && actual.trim() !== '';
      case 'Greater Than (>)': return parseFloat(a) > parseFloat(v);
      case 'Less Than (<)':    return parseFloat(a) < parseFloat(v);
      default:                 return a === v;
    }
  }

  private async handleJumpTo(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const targetNodeId = config.targetNodeId;
    if (!targetNodeId) return await this.markCompleted(session.id);

    const targetNode = allNodes.find(n => n.id === targetNodeId);
    if (!targetNode) return await this.markCompleted(session.id);

    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { currentNodeId: targetNodeId } });
    await this.executeNode({ ...session, currentNodeId: targetNodeId }, targetNode, edges, allNodes, contact, messageData);
  }

  private async handleUpdateField(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const fieldToUpdate = config.fieldName;
    const valueSource = config.valueSource || 'free_text';
    let valueToSet = '';

    if (valueSource === 'free_text') {
      valueToSet = await this.resolveVariables(config.fieldValue || '', session, contact, messageData);
    } else if (valueSource === 'last_message') {
      valueToSet = messageData?.body || '';
    } else if (valueSource === 'custom_field') {
      const sourceField = config.sourceField;
      if (sourceField) {
        const customFields = ((contact as any).customFields as Record<string, any>) || {};
        valueToSet = customFields[sourceField] || '';
      }
    }

    if (fieldToUpdate) {
      const currentFields = ((contact as any).customFields as Record<string, any>) || {};
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { customFields: { ...currentFields, [fieldToUpdate]: valueToSet } },
      });
      this.logger.log(`Updated contact ${contact.phone} field ${fieldToUpdate} to "${valueToSet}" via ${valueSource}.`);
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleUpdateLabel(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const action: 'add' | 'remove' = config.action || 'add';
    const tag: string = config.tag || config.label || '';

    if (tag) {
      const currentTags: string[] = contact.tags || [];
      const newTags = action === 'add'
        ? [...new Set([...currentTags, tag])]
        : currentTags.filter(t => t !== tag);
      await this.prisma.contact.update({ where: { id: contact.id }, data: { tags: newTags } });
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleUpdateSubscription(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const status = config.status || 'ACTIVE'; // 'ACTIVE' or 'UNSUBSCRIBED'
    
    const updateData: any = { status };
    if (status === 'ACTIVE') {
      updateData.optedInAt = new Date();
    } else if (status === 'UNSUBSCRIBED') {
      updateData.optedOutAt = new Date();
    }

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: updateData
    });

    this.logger.log(`Updated contact ${contact.phone} subscription status to ${status}.`);

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleAssignTeam(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const mode = config.assignmentMode || 'direct'; // 'direct' or 'round-robin'
    let agentId = config.agentId;

    if (mode === 'round-robin') {
      // Fetch all users in the organization
      const users = await this.prisma.user.findMany({
        where: { organizationId: session.organizationId },
        orderBy: { id: 'asc' }
      });

      if (users.length > 0) {
        // Simple Round Robin: Find the last assigned contact for this organization and pick the next user
        const lastContact = await this.prisma.contact.findFirst({
          where: { organizationId: session.organizationId, agentId: { not: null } },
          orderBy: { updatedAt: 'desc' }
        });

        if (lastContact && lastContact.agentId) {
          const lastIndex = users.findIndex(u => u.id === lastContact.agentId);
          const nextIndex = (lastIndex + 1) % users.length;
          agentId = users[nextIndex].id;
        } else {
          agentId = users[0].id;
        }
      }
    }

    if (agentId) {
      await this.prisma.contact.update({ 
        where: { id: contact.id }, 
        data: { agentId } 
      });
      this.logger.log(`Assigned contact ${contact.phone} to agent ${agentId} via ${mode} mode.`);
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleAssignSequence(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    this.logger.log(`Assigning contact ${contact.phone} to sequence ${config.sequenceId} (Org: ${session.organizationId})`);
    
    // Enrollment logic will be implemented here later when the sequence component is ready.
    // For now, we just advance the flow.
    
    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleRemoveSequence(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    this.logger.log(`Removing contact ${contact.phone} from sequence ${config.sequenceId} (Org: ${session.organizationId})`);
    
    // Removal logic will be implemented here later when the sequence component is ready.
    // For now, we just advance the flow.
    
    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  public async handleResolveConversation(session: ChatbotSession, node: FlowNode) {
    await this.markCompleted(session.id);
  }

  private async handleHttpApi(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    if (!config.url) return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);

    // Resolve variables in URL and body
    const url = await this.resolveVariables(config.url, session, contact, messageData);
    const bodyRaw = config.body ? await this.resolveVariables(config.body, session, contact, messageData) : undefined;

    const params: any = {};
    for (const p of (config.queryParams || [])) {
      if (p.key) params[p.key] = await this.resolveVariables(p.value || '', session, contact, messageData);
    }

    const headers: any = {};
    for (const h of (config.headers || [])) {
      if (h.key) headers[h.key] = await this.resolveVariables(h.value || '', session, contact, messageData);
    }

    if (config.auth?.type === 'Bearer' && config.auth.value) {
      headers['Authorization'] = `Bearer ${config.auth.value}`;
    } else if (config.auth?.type === 'API Key' && config.auth.key) {
      headers[config.auth.key] = config.auth.value;
    }

    let responseData: any = {};
    try {
      const res = await axios({
        method: config.method || 'GET',
        url,
        params,
        headers,
        data: config.method !== 'GET' && bodyRaw ? JSON.parse(bodyRaw) : undefined,
        timeout: 15000,
      });
      responseData = res.data;
    } catch (err: any) {
      this.logger.error(`HttpApi node error: ${err.message}`);
      responseData = {};
    }

    // Apply mappings: extract JSON paths and store in session variables
    let variables = (session.variables || {}) as Record<string, any>;
    for (const mapping of (config.mappings || [])) {
      if (!mapping.jsonPath || !mapping.storeIn) continue;
      const extracted = this.extractJsonPath(responseData, mapping.jsonPath);
      if (mapping.storeIn.startsWith('custom.')) {
        const fieldName = mapping.storeIn.replace('custom.', '');
        const currentFields = ((contact as any).customFields as Record<string, any>) || {};
        await this.prisma.contact.update({
          where: { id: contact.id },
          data: { customFields: { ...currentFields, [fieldName]: extracted } },
        });
      } else if (mapping.storeIn.startsWith('var.')) {
        variables[mapping.storeIn.replace('var.', '')] = extracted;
      } else {
        variables[mapping.storeIn] = extracted;
      }
    }

    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
    await this.advanceFromNode({ ...session, variables } as any, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleWorkingHours(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const timezone = config.timezone || 'UTC';
    const schedule = config.schedule || {};
    const holidays = config.holidays || [];
    // fallback is reserved for future use if we want to handle missing days differently
    
    try {
      const now = new Date();
      // Get time in the specified timezone using native Intl API
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'long',
      });

      const parts = formatter.formatToParts(now);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value;

      const weekday = getPart('weekday')?.toLowerCase(); 
      const dateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`; 
      const timeStr = `${getPart('hour')}:${getPart('minute')}`;

      // 1. Check Holidays
      if (holidays.includes(dateStr)) {
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
      }

      // 2. Check Weekly Schedule
      if (!weekday) return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
      const dayConfig = (schedule as any)[weekday];
      if (!dayConfig || !dayConfig.enabled) {
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
      }

      const { open, close, breakStart, breakEnd } = dayConfig;

      // Check Open/Close (String comparison works for HH:mm)
      const isWithinHours = timeStr >= (open || '00:00') && timeStr <= (close || '23:59');
      if (!isWithinHours) {
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
      }

      // Check Break (Optional)
      if (breakStart && breakEnd) {
        const isWithinBreak = timeStr >= breakStart && timeStr <= breakEnd;
        if (isWithinBreak) {
          return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
        }
      }

      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'open');
    } catch (err) {
      this.logger.error(`WorkingHours node error: ${err.message}`);
      // Default to closed or fallback on error
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, config.fallback || 'closed');
    }
  }

  private async handleDetectCountry(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const source = config.phoneSource || 'contact.phone';
    const saveCodeTo = config.saveCountryCodeTo;
    const saveNameTo = config.saveCountryNameTo;
    const alsoSaveName = config.alsoSaveCountryName;

    let phoneNumberStr = '';
    if (source === 'contact.phone') {
      phoneNumberStr = contact.phone;
    } else if (source.startsWith('custom.')) {
      const field = source.replace('custom.', '');
      phoneNumberStr = (contact.customFields as any)?.[field] || '';
    } else if (source.startsWith('var.')) {
      const name = source.replace('var.', '');
      phoneNumberStr = (session.variables as any)?.[name] || '';
    }

    try {
      if (!phoneNumberStr.startsWith('+')) {
        phoneNumberStr = '+' + phoneNumberStr;
      }

      const phoneNumber = parsePhoneNumber(phoneNumberStr);
      if (phoneNumber && phoneNumber.country) {
        const countryCode = phoneNumber.country; // e.g. "IN"
        const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;

        const updates: any = {};
        const variables = { ...(session.variables as any) || {} };

        // Save Country Code
        if (saveCodeTo) {
          if (saveCodeTo.startsWith('custom.')) {
            const field = saveCodeTo.replace('custom.', '');
            updates.customFields = { ...(contact.customFields as any) || {}, [field]: countryCode };
          } else {
            const name = saveCodeTo.startsWith('var.') ? saveCodeTo.replace('var.', '') : saveCodeTo;
            variables[name] = countryCode;
          }
        }

        // Save Country Name
        if (alsoSaveName && saveNameTo) {
          if (saveNameTo.startsWith('custom.')) {
            const field = saveNameTo.replace('custom.', '');
            updates.customFields = { ...(updates.customFields || contact.customFields || {}), [field]: countryName };
          } else {
            const name = saveNameTo.startsWith('var.') ? saveNameTo.replace('var.', '') : saveNameTo;
            variables[name] = countryName;
          }
        }

        if (Object.keys(updates).length > 0) {
          await this.prisma.contact.update({ where: { id: contact.id }, data: updates });
        }

        await this.prisma.chatbotSession.update({
          where: { id: session.id },
          data: { variables }
        });
        
        session.variables = variables;
      }
    } catch (err) {
      this.logger.error(`DetectCountry error: ${err.message}`);
    }

    return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleAiResponse(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const systemPrompt = await this.resolveVariables(config.systemPrompt || 'You are a helpful assistant.', session, contact, messageData);
    const includeHistory = config.includeHistory !== false;
    const saveTo = config.saveToField || 'ai_response';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured in .env');
      return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }

    try {
      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      if (includeHistory) {
        const conversation = await this.prisma.conversation.findFirst({
          where: { contactId: contact.id, whatsappAccountId: session.accountId }
        });
        
        if (conversation) {
          const history = await this.prisma.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'desc' },
            take: 10
          });

          // Reverse to chronological order
          history.reverse().forEach(msg => {
            if (msg.type === 'TEXT' && (msg.content as any)?.body) {
              messages.push({
                role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
                content: (msg.content as any).body
              });
            }
          });
        }
      }

      // Add the current incoming message if it's not already in history (or if history was skipped)
      const currentText = messageData.text?.body || '';
      if (currentText) {
         // Avoid duplicating if it was the last message in history
         if (messages[messages.length - 1]?.content !== currentText) {
            messages.push({ role: 'user', content: currentText });
         }
      }

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1000
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });

      const aiText = response.data.choices[0].message.content;
      
      const variables = { ...(session.variables as any) || {} };
      const updates: any = {};

      if (saveTo.startsWith('custom.')) {
        const field = saveTo.replace('custom.', '');
        updates.customFields = { ...(contact.customFields as any) || {}, [field]: aiText };
      } else {
        const name = saveTo.startsWith('var.') ? saveTo.replace('var.', '') : saveTo;
        variables[name] = aiText;
      }

      if (Object.keys(updates).length > 0) {
        await this.prisma.contact.update({ where: { id: contact.id }, data: updates });
      }

      await this.prisma.chatbotSession.update({
        where: { id: session.id },
        data: { variables }
      });

      session.variables = variables;

    } catch (err: any) {
      this.logger.error(`AI Response error: ${err.response?.data?.error?.message || err.message}`);
    }

    return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  // ─── Variable Resolution ─────────────────────────────────────────────────

  public async resolveVariables(template: string, session: ChatbotSession, contact: Contact, messageData: any): Promise<string> {
    if (!template) return '';
    const sessionVars = (session.variables || {}) as Record<string, any>;
    const customFields = ((contact as any).customFields as Record<string, any>) || {};

    return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
      // {{var.VARNAME}}
      if (key.startsWith('var.')) return String(sessionVars[key.slice(4)] ?? match);
      // {{custom.FIELDNAME}}
      if (key.startsWith('custom.')) return String(customFields[key.slice(7)] ?? match);
      // {{contact.field}}
      if (key.startsWith('contact.')) {
        const field = key.slice(8);
        return String((contact as any)[field] ?? match);
      }
      // {{message.text}}
      if (key === 'message.text') return messageData?.text?.body || '';
      // Nested path fallback
      const parts = key.split('.');
      let val: any = { contact, var: sessionVars, custom: customFields, message: { text: messageData?.text?.body } };
      for (const p of parts) {
        val = val?.[p];
        if (val === undefined) break;
      }
      return val !== undefined ? String(val) : match;
    });
  }

  // ─── Flow Navigation ─────────────────────────────────────────────────────

  private async advanceFromNode(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any, sourceHandle?: string) {
    let outEdges = edges.filter(e => e.source === node.id);

    if (sourceHandle) {
      const specific = outEdges.filter(e => e.sourceHandle === sourceHandle);
      if (specific.length > 0) {
        outEdges = specific;
      } else {
        if (sourceHandle === 'submitted') {
          const fallback = outEdges.filter(e => e.sourceHandle === 'output');
          outEdges = fallback.length > 0 ? fallback : outEdges.filter(e => !e.sourceHandle);
        } else {
          outEdges = outEdges.filter(e => !e.sourceHandle);
        }
      }
    }

    if (outEdges.length === 0) {
      this.logger.log(`Flow end reached at node ${node.id}`);
      return await this.markCompleted(session.id);
    }

    const nextNodeId = outEdges[0].target;
    const nextNode = allNodes.find(n => n.id === nextNodeId);
    if (!nextNode) return await this.markCompleted(session.id);

    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { currentNodeId: nextNodeId } });
    await this.executeNode({ ...session, currentNodeId: nextNodeId }, nextNode, edges, allNodes, contact, messageData);
  }

  private async markCompleted(sessionId: string) {
    await this.prisma.chatbotSession.update({
      where: { id: sessionId },
      data: { status: ChatbotSessionStatus.COMPLETED },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private extractJsonPath(obj: any, path: string): any {
    try {
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
      let val = obj;
      for (const p of parts) {
        if (val === null || val === undefined) break;
        val = val[p];
      }
      return val ?? '';
    } catch {
      return '';
    }
  }
}
