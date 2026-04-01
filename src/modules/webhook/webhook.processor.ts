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
      // 1. Extract contact info
      const contactData = data.contacts?.[0];
      const messageData = data.messages?.[0];

      if (!messageData) {
        this.logger.warn(`No message data in event ${eventId}`);
        return;
      }

      const waMessageId = messageData.id;
      const from = messageData.from; // sender phone
      const incomingName = contactData?.profile?.name;

      // 2. Create or update contact
      const existingContact = await this.prisma.contact.findUnique({
        where: { organizationId_phone: { organizationId, phone: from } }
      });

      const updateData: any = {
        whatsappId: contactData?.wa_id || existingContact?.whatsappId,
      };

      // Only update firstName if we got a real name and current is empty or generic
      if (incomingName && (!existingContact?.firstName || existingContact.firstName === 'WhatsApp User' || existingContact.firstName === from)) {
        updateData.firstName = incomingName;
      }

      const contact = await this.contactsService.createOrUpdate(organizationId, from, updateData);

      // 3. Process the message via MessagingService (handles conversations)
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
      } else if (messageData.type === 'audio') {
        messageType = MessageType.AUDIO;
        content = { audio: messageData.audio, body: '[Audio]' };
      } else if (messageData.type === 'document') {
        messageType = MessageType.DOCUMENT;
        content = { document: messageData.document, body: messageData.document.filename || '[Document]' };
      } else if (messageData.type === 'location') {
        messageType = MessageType.LOCATION;
        content = { location: messageData.location, body: '[Location Shared]' };
      } else if (messageData.type === 'button') {
        messageType = MessageType.TEXT;
        content = { body: messageData.button.text, payload: messageData.button.payload };
      } else if (messageData.type === 'interactive') {
        messageType = MessageType.TEXT;
        const interactiveType = messageData.interactive.type;
        content = { 
          body: messageData.interactive[interactiveType]?.title || '[Interactive Message]',
          payload: messageData.interactive[interactiveType]?.id 
        };
      }

      await this.messagingService.createMessage({
        organizationId,
        whatsappAccountId: accountId,
        contactId: contact.id,
        waMessageId,
        direction: MessageDirection.INBOUND,
        type: messageType,
        status: MessageStatus.READ,
        content,
        sentAt: new Date(parseInt(messageData.timestamp) * 1000),
      });

      // 4. Mark event as processed
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      this.logger.log(`Successfully processed message ${waMessageId}`);
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
}
