import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatbotSession, ChatbotSessionStatus, Contact, Chatbot } from '@prisma/client';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import axios from 'axios';

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

    await this.advanceFromNode(session, triggerNode, flowData.edges || [], flowData.nodes, contact, messageData);
  }

  async resumeSession(session: ChatbotSession, contact: Contact, messageData: any) {
    this.logger.log(`Resuming session ${session.id} for contact ${contact.phone}`);
    const flowData = (await this.prisma.chatbot.findUnique({ where: { id: session.chatbotId } }))?.flowData as any;
    if (!flowData) return;

    const currentNode = flowData.nodes.find((n: any) => n.id === session.currentNodeId);
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

        await this.prisma.chatbotSession.update({
          where: { id: session.id },
          data: { variables },
        });
      }
      routeHandle = 'output';
    } else if (waitingType === 'button') {
      // Route by button ID — each button's ID maps to a sourceHandle like "btn_BUTTONID"
      const buttonId = messageData.interactive?.button_reply?.id ?? messageData.button?.payload ?? '';
      const varName = currentNode.data?.config?.saveToVariable;
      if (varName) {
        if (varName.startsWith('custom.')) {
          const fieldName = varName.replace('custom.', '');
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: buttonId } },
          });
          variables = { ...variables, [varName]: buttonId };
        } else {
          const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
          variables = { ...variables, [name]: buttonId };
        }
        await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
      }
      routeHandle = buttonId ? `btn_${buttonId}` : 'output';
    } else if (waitingType === 'list') {
      const listId = messageData.interactive?.list_reply?.id ?? '';
      const varName = currentNode.data?.config?.saveToVariable;
      if (varName) {
        if (varName.startsWith('custom.')) {
          const fieldName = varName.replace('custom.', '');
          const currentFields = ((contact as any).customFields as Record<string, any>) || {};
          await this.prisma.contact.update({
            where: { id: contact.id },
            data: { customFields: { ...currentFields, [fieldName]: listId } },
          });
          variables = { ...variables, [varName]: listId };
        } else {
          const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
          variables = { ...variables, [name]: listId };
        }
        await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
      }
      routeHandle = listId ? `list_${listId}` : 'output';
    }

    // Mark active again
    const updatedSession = await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: { status: ChatbotSessionStatus.ACTIVE, waitingForInput: false, waitingNodeType: null },
    });

    await this.advanceFromNode(
      { ...updatedSession, variables } as any,
      currentNode,
      flowData.edges || [],
      flowData.nodes,
      contact,
      messageData,
      routeHandle,
    );
  }

  // ─── Node Dispatcher ─────────────────────────────────────────────────────

  private async executeNode(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    this.logger.debug(`Executing node type=${node.type} id=${node.id}`);
    try {
      switch (node.type) {
        case 'sendText':       return await this.handleSendText(session, node, edges, allNodes, contact, messageData);
        case 'sendButton':     return await this.handleSendButton(session, node, edges, allNodes, contact, messageData);
        case 'sendList':       return await this.handleSendList(session, node, edges, allNodes, contact, messageData);
        case 'sendMedia':      return await this.handleSendMedia(session, node, edges, allNodes, contact, messageData);
        case 'sendTemplate':   return await this.handleSendTemplate(session, node, edges, allNodes, contact, messageData);
        case 'askQuestion':
        case 'askText':
        case 'askNumber':
        case 'askEmail':
        case 'askDate':        return await this.handleAskQuestion(session, node, edges, allNodes, contact, messageData);
        case 'delay':          return await this.handleDelay(session, node, edges, allNodes, contact, messageData);
        case 'condition':      return await this.handleCondition(session, node, edges, allNodes, contact, messageData);
        case 'jumpTo':         return await this.handleJumpTo(session, node, edges, allNodes, contact, messageData);
        case 'updateField':    return await this.handleUpdateField(session, node, edges, allNodes, contact, messageData);
        case 'updateLabel':    return await this.handleUpdateLabel(session, node, edges, allNodes, contact, messageData);
        case 'assignTeam':     return await this.handleAssignTeam(session, node, edges, allNodes, contact, messageData);
        case 'resolveConversation': return await this.handleResolveConversation(session, node);
        case 'httpApi':        return await this.handleHttpApi(session, node, edges, allNodes, contact, messageData);
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

  // ─── Node Handlers ───────────────────────────────────────────────────────

  private async handleSendText(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    let text = await this.resolveVariables(config.text || '', session, contact, messageData);
    if (text) {
      await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, text);
    }
    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleAskQuestion(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const question = await this.resolveVariables(config.question || config.text || '', session, contact, messageData);
    if (question) {
      await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
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
      id: b.id || b.payload || b.title,
      title: b.title || b.label,
    }));

    if (buttons.length > 0) {
      await this.whatsappService.sendInteractiveButtons(
        session.organizationId, session.accountId, contact.phone,
        bodyText, buttons, headerText, footerText,
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
      await this.whatsappService.sendInteractiveList(
        session.organizationId, session.accountId, contact.phone,
        bodyText, buttonText, sections, headerText, footerText,
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

    // Resolve variable components
    const components: any[] = [];
    if (config.bodyParams?.length) {
      const params = await Promise.all(
        config.bodyParams.map(async (p: string) => ({
          type: 'text',
          text: await this.resolveVariables(p, session, contact, messageData),
        })),
      );
      components.push({ type: 'body', parameters: params });
    }

    await this.whatsappService.sendTemplateMessage(
      session.organizationId, session.accountId, contact.phone,
      config.templateName, config.language || 'en_US', components,
    );

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleDelay(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const amount = parseInt(config.delayAmount || config.amount || '5', 10);
    const unit: string = config.delayUnit || config.unit || 'seconds';

    const unitMs: Record<string, number> = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
    };
    const delayMs = amount * (unitMs[unit] || 1000);

    // Save next node info so the processor knows where to resume
    const outEdge = edges.find(e => e.source === node.id);
    const nextNodeId = outEdge?.target;

    if (!nextNodeId) {
      return await this.markCompleted(session.id);
    }

    await this.prisma.chatbotSession.update({
      where: { id: session.id },
      data: {
        status: ChatbotSessionStatus.WAITING_REPLY,
        waitingForInput: false,
        currentNodeId: nextNodeId,
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
    const handle = passed ? 'success' : 'fail';

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, handle);
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
    const fieldName = config.fieldName;
    const fieldValue = await this.resolveVariables(config.fieldValue || '', session, contact, messageData);

    if (fieldName) {
      const currentFields = ((contact as any).customFields as Record<string, any>) || {};
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { customFields: { ...currentFields, [fieldName]: fieldValue } },
      });
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

  private async handleAssignTeam(session: ChatbotSession, node: FlowNode, edges: FlowEdge[], allNodes: FlowNode[], contact: Contact, messageData: any) {
    const config = node.data?.config || {};
    const agentId = config.agentId;

    if (agentId) {
      await this.prisma.contact.update({ where: { id: contact.id }, data: { agentId } });
    }

    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
  }

  private async handleResolveConversation(session: ChatbotSession, node: FlowNode) {
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
      outEdges = specific.length > 0 ? specific : outEdges.filter(e => !e.sourceHandle);
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
