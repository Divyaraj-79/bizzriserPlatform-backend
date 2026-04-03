import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ContactsService } from '../contacts/contacts.service';
import { MessageDirection, MessageType, MessageStatus, CampaignStatus } from '@prisma/client';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly contactsService: ContactsService,
  ) {}

  /**
   * Retrieves or creates a conversation between a WhatsApp account and a contact.
   */
  async findOrCreateConversation(orgId: string, accountId: string, contactId: string) {
    return this.prisma.conversation.upsert({
      where: {
        organizationId_whatsappAccountId_contactId: {
          organizationId: orgId,
          whatsappAccountId: accountId,
          contactId,
        },
      },
      update: {},
      create: {
        organizationId: orgId,
        whatsappAccountId: accountId,
        contactId,
      },
    });
  }

  /**
   * Handles creating a message and updating the associated conversation.
   */
  async createMessage(data: {
    organizationId: string;
    whatsappAccountId: string;
    contactId: string;
    direction: MessageDirection;
    type: MessageType;
    content: any;
    waMessageId?: string;
    status?: MessageStatus;
    sentAt?: Date;
    metadata?: any;
  }) {
    const conversation = await this.findOrCreateConversation(
      data.organizationId,
      data.whatsappAccountId,
      data.contactId,
    );

    const message = await this.prisma.message.create({
      data: {
        ...data,
        conversationId: conversation.id,
      },
    });

    let body = 'Media message';
    if (data.type === MessageType.TEXT) body = data.content.body;
    else if (data.type === MessageType.TEMPLATE) body = `Template: ${data.content.templateName}`;

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageBody: body,
        lastMessageAt: message.sentAt || message.createdAt,
      },
    });

    this.realtimeGateway.emitNewMessage(data.organizationId, message);
    this.realtimeGateway.emitConversationUpdate(data.organizationId, updatedConversation);

    return message;
  }

  async sendTemplateMessage(orgId: string, accountId: string, contactId: string, templateName: string, language: string = 'en_US', components: any[] = [], metadata: any = {}) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new Error('Contact not found');

    const message = await this.createMessage({
      organizationId: orgId,
      whatsappAccountId: accountId,
      contactId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
      content: { templateName, components, body: `[Template: ${templateName}]` },
      status: MessageStatus.PENDING,
      metadata
    });

    try {
      const response = await this.whatsapp.sendTemplateMessage(orgId, accountId, contact.phone, templateName, language, components);
      const waMessageId = response.messages?.[0]?.id;

      return await this.prisma.message.update({
        where: { id: message.id },
        data: { waMessageId, status: MessageStatus.SENT, sentAt: new Date() },
      });
    } catch (error: any) {
      this.logger.error(`Failed to send template message: ${error.message}`);
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: MessageStatus.FAILED, failureReason: error.message, failedAt: new Date() },
      });

      // Update CampaignRecipient if it's a broadcast
      if (metadata?.campaignId) {
         const recipient = await this.prisma.campaignRecipient.findFirst({
           where: { campaignId: metadata.campaignId, contactId }
         });
         if (recipient) {
            await this.prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: MessageStatus.FAILED, failedAt: new Date(), failureReason: error.message }
            });
         }
      }

      throw error;
    }
  }

  async updateMessageStatus(waMessageId: string, status: MessageStatus, failureReason?: string) {
    const message = await this.prisma.message.findUnique({
      where: { waMessageId },
      select: { id: true, organizationId: true, metadata: true, status: true, contactId: true }
    });

    if (!message) return null;
    if (message.status === status) return message;

    const data: any = { status };
    if (status === MessageStatus.DELIVERED) data.deliveredAt = new Date();
    else if (status === MessageStatus.READ) data.readAt = new Date();
    else if (status === MessageStatus.FAILED) {
       data.failedAt = new Date();
       data.failureReason = failureReason;
    }

    const updatedMessage = await this.prisma.message.update({
      where: { id: message.id },
      data
    });

    const metadata = message.metadata as any;
    if (metadata?.campaignId) {
      const campaignId = metadata.campaignId;
      
      const updateData: any = {};
      const recipientUpdate: any = { status };

      if (status === MessageStatus.DELIVERED) {
         updateData.deliveredCount = { increment: 1 };
         recipientUpdate.deliveredAt = new Date();
      } else if (status === MessageStatus.READ) {
         updateData.readCount = { increment: 1 };
         recipientUpdate.readAt = new Date();
      } else if (status === MessageStatus.FAILED) {
         updateData.failedCount = { increment: 1 };
         recipientUpdate.failedAt = new Date();
         recipientUpdate.failureReason = failureReason || 'Meta delivery failure';
      }

      if (Object.keys(updateData).length > 0) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: updateData
        });
        
        const recipient = await this.prisma.campaignRecipient.findFirst({
           where: { campaignId, contactId: updatedMessage.contactId }
        });
        if (recipient) {
           await this.prisma.campaignRecipient.update({
             where: { id: recipient.id },
             data: recipientUpdate
           });
        }
      }
    }

    this.realtimeGateway.emitMessageStatusUpdate(updatedMessage.organizationId, updatedMessage);
    return updatedMessage;
  }

  // Helper methodologies... (omitted for brevity but assume they exist below)
  async getConversations(orgId: string) {
    return this.prisma.conversation.findMany({
      where: { organizationId: orgId },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }
}
