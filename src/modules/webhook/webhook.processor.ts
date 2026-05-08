import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { MessageDirection, MessageType, MessageStatus, ChatbotSessionStatus } from '@prisma/client';
import { FlowExecutorService } from '../chatbots/executor/flow-executor.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Processor('webhooks')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly messagingService: MessagingService,
    private readonly flowExecutor: FlowExecutorService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Process('process-message')
  async handleProcessMessage(job: Job<any>) {
    const { eventId, accountId, organizationId, data } = job.data;
    this.logger.log(`Processing message for event ${eventId}`);

    try {
      // 1. Handle Status Updates (Sent, Delivered, Read, Failed)
      if (data.statuses && data.statuses.length > 0) {
        await this.handleStatusUpdate(data.statuses[0]);
      }

      // 2. Handle Incoming Messages
      if (data.messages && data.messages.length > 0) {
        await this.handleIncomingMessage(accountId, organizationId, data);
      }

      // 3. Mark event as processed
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      this.logger.log(`Successfully processed event ${eventId}`);
    } catch (error) {
      this.logger.error(`Error processing message event ${eventId}: ${error.message}`);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          error: error.message,
          retryCount: { increment: 1 },
        },
      });
      throw error;
    }
  }

  private async handleStatusUpdate(statusData: any) {
    const waMessageId = statusData.id;
    const metaStatus = statusData.status; // delivered, read, sent, failed

    let status: MessageStatus = MessageStatus.SENT;
    if (metaStatus === 'delivered') status = MessageStatus.DELIVERED;
    else if (metaStatus === 'read') status = MessageStatus.READ;
    else if (metaStatus === 'failed') status = MessageStatus.FAILED;

    this.logger.debug(`Updating status for message ${waMessageId} to ${status}`);
    
    // Use MessagingService to handle both message and campaign analytics update
    await this.messagingService.updateMessageStatus(waMessageId, status);
  }

  private async handleIncomingMessage(accountId: string, organizationId: string, data: any) {
    const messageData = data.messages[0];
    const waMessageId = messageData.id;
    const from = messageData.from; // sender phone
    
    // Find contact profile in the payload (Meta sends a separate contacts array)
    const contactProfile = data.contacts?.find((c: any) => c.wa_id === from || c.wa_id === from.replace(/\+/g, ''));
    const incomingName = contactProfile?.profile?.name;
    
    this.logger.debug(`[WEBHOOK] Incoming Name from Meta: "${incomingName}" for phone: ${from}`);

    // 1. Create or update contact
    const existingContact = await this.prisma.contact.findUnique({
      where: { organizationId_phone: { organizationId, phone: from } }
    });

    const updateData: any = {
      whatsappId: contactProfile?.wa_id || existingContact?.whatsappId,
    };

    // If Meta provides a name, always use it as the source of truth
    if (incomingName && incomingName.trim().length > 0) {
      this.logger.log(`[WEBHOOK] Capturing Meta profile name: ${incomingName}`);
      updateData.firstName = incomingName;
      updateData.lastName = ''; // Profile name usually contains full name
    }

    const contact = await this.contactsService.createOrUpdate(organizationId, from, updateData);
    this.logger.debug(`[WEBHOOK] Contact Sync Complete: ${contact.id} (Display Name: ${contact.firstName})`);

    // 2. Map message type
    let messageType: MessageType = MessageType.TEXT;
    let content: any = {};

    if (messageData.type === 'text') {
      messageType = MessageType.TEXT;
      content = { body: messageData.text.body };
    } else if (messageData.type === 'image') {
      messageType = MessageType.IMAGE;
      content = { image: messageData.image, body: messageData.image.caption || '[Image]' };
    } else if (messageData.type === 'video') {
      messageType = MessageType.VIDEO;
      content = { video: messageData.video, body: messageData.video.caption || '[Video]' };
    } else if (messageData.type === 'document') {
      messageType = MessageType.DOCUMENT;
      content = { document: messageData.document, body: messageData.document.filename || '[Document]' };
    } else if (messageData.type === 'interactive') {
      messageType = MessageType.TEXT;
      const it = messageData.interactive.type;
      if (it === 'button_reply') {
        content = {
          body: messageData.interactive.button_reply?.title || '[Button Reply]',
          payload: messageData.interactive.button_reply?.id,
        };
      } else if (it === 'list_reply') {
        content = {
          body: messageData.interactive.list_reply?.title || '[List Reply]',
          payload: messageData.interactive.list_reply?.id,
        };
      } else {
        content = {
          body: messageData.interactive[it]?.title || '[Interactive]',
          payload: messageData.interactive[it]?.id,
        };
      }
    } else if (messageData.type === 'button') {
      messageType = MessageType.TEXT;
      content = { body: messageData.button.text, payload: messageData.button.payload };
    } else if (messageData.type === 'location') {
      messageType = MessageType.TEXT;
      content = { 
        latitude: messageData.location.latitude, 
        longitude: messageData.location.longitude,
        body: `[Location: ${messageData.location.latitude}, ${messageData.location.longitude}]`
      };
    } else if (messageData.type === 'audio') {
      messageType = MessageType.AUDIO;
      content = { audio: messageData.audio, body: '[Audio]' };
    }

    // 3. Create message record
    const savedMessage = await this.messagingService.createMessage({
      organizationId,
      whatsappAccountId: accountId,
      contactId: contact.id,
      waMessageId,
      direction: MessageDirection.INBOUND,
      type: messageType,
      status: MessageStatus.READ, // Incoming messages are considered read by system
      content,
      sentAt: new Date(parseInt(messageData.timestamp) * 1000),
    });

    try {
      // 4. Check for active chatbot session (WAITING_REPLY)
      const existingSession = await this.prisma.chatbotSession.findFirst({
        where: { contactId: contact.id, organizationId, status: ChatbotSessionStatus.WAITING_REPLY }
      });

      if (existingSession) {
        await this.flowExecutor.resumeSession(existingSession, contact, messageData);
        return; 
      }

      // 5. Check for matching chatbot trigger (NEW session)
      const activeBots = await this.prisma.chatbot.findMany({
        where: { organizationId, status: 'ACTIVE', channel: 'WHATSAPP' }
      });

      let matched = null;
      const msgText = messageData.text?.body?.toLowerCase() ?? '';

      matched = activeBots.find(b =>
        b.triggerType === 'KEYWORD_MATCH' &&
        b.keywords.some(k => msgText.includes(k.toLowerCase()))
      );

      if (!matched) {
        if (!existingContact) {
          matched = activeBots.find(b => b.triggerType === 'NEW_CONVERSATION');
        }
      }

      if (!matched)
        matched = activeBots.find(b => b.triggerType === 'MESSAGE_RECEIVED');

      if (!matched)
        matched = activeBots.find(b => b.triggerType === 'NO_MATCH_REPLY');

      if (matched) {
        await this.flowExecutor.startSession(organizationId, accountId, matched, contact, messageData);
      }
    } catch (err) {
      this.logger.error(`Error processing chatbot flow logic: ${err.message}`);
    }
  }

  @Process('process-payment-update')
  async handlePaymentUpdate(job: Job<any>) {
    const { accountId, organizationId, wabaId } = job.data;
    this.logger.log(`Processing payment update for WABA ${wabaId}, Account ${accountId}`);

    try {
      // Trigger registration (smart registration will check if actually needed)
      await this.whatsappService.registerPhoneNumber(organizationId, accountId);
    } catch (error) {
      this.logger.error(`Error handling payment update for account ${accountId}: ${error.message}`);
    }
  }
}
