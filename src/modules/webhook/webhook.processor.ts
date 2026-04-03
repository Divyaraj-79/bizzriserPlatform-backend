import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { MessageDirection, MessageType, MessageStatus } from '@prisma/client';

@Processor('webhooks')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly messagingService: MessagingService,
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
        await this.handleIncomingMessage(accountId, organizationId, data.contacts?.[0], data.messages[0]);
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

  private async handleIncomingMessage(accountId: string, organizationId: string, contactData: any, messageData: any) {
    const waMessageId = messageData.id;
    const from = messageData.from; // sender phone
    const incomingName = contactData?.profile?.name;

    // 1. Create or update contact
    const existingContact = await this.prisma.contact.findUnique({
      where: { organizationId_phone: { organizationId, phone: from } }
    });

    const updateData: any = {
      whatsappId: contactData?.wa_id || existingContact?.whatsappId,
    };

    if (incomingName && (!existingContact?.firstName || existingContact.firstName === 'WhatsApp User' || existingContact.firstName === from)) {
      updateData.firstName = incomingName;
    }

    const contact = await this.contactsService.createOrUpdate(organizationId, from, updateData);

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
      content = { 
        body: messageData.interactive[it]?.title || '[Interactive]',
        payload: messageData.interactive[it]?.id 
      };
    } else if (messageData.type === 'button') {
      messageType = MessageType.TEXT;
      content = { body: messageData.button.text, payload: messageData.button.payload };
    }

    // 3. Create message record
    await this.messagingService.createMessage({
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
  }
}
