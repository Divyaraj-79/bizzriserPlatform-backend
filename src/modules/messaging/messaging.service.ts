import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ContactsService } from '../contacts/contacts.service';
import { MessageDirection, MessageType, MessageStatus } from '@prisma/client';

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
  }) {
    // 1. Ensure conversation exists
    const conversation = await this.findOrCreateConversation(
      data.organizationId,
      data.whatsappAccountId,
      data.contactId,
    );

    // 2. Create the message
    const message = await this.prisma.message.create({
      data: {
        ...data,
        conversationId: conversation.id,
      },
    });

    // 3. Update conversation's last message info
    let body = 'Media message';
    if (data.type === MessageType.TEXT) {
      body = data.content.body;
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageBody: body,
        lastMessageAt: message.sentAt || message.createdAt,
      },
    });

    // 4. Emit realtime events
    this.realtimeGateway.emitNewMessage(data.organizationId, message);
    this.realtimeGateway.emitConversationUpdate(data.organizationId, updatedConversation);

    return message;
  }

  /**
   * Sends an outbound text message and records it in the database.
   */
  async sendTextMessage(orgId: string, accountId: string, contactId: string, text: string) {
    // 1. Get contact phone
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new Error('Contact not found');

    // 2. Create message in PENDING state
    const message = await this.createMessage({
      organizationId: orgId,
      whatsappAccountId: accountId,
      contactId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEXT,
      content: { body: text },
      status: MessageStatus.PENDING,
    });

    try {
      // 3. Call WhatsApp API (uses account-specific decrypted token)
      const response = await this.whatsapp.sendTextMessage(orgId, accountId, contact.phone, text);
      const waMessageId = response.messages?.[0]?.id;

      // 4. Update message with WhatsApp's ID and SENT status
      return await this.prisma.message.update({
        where: { id: message.id },
        data: {
          waMessageId,
          status: MessageStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failureReason: error.message,
          failedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Sends an outbound template message and records it.
   */
  async sendTemplateMessage(orgId: string, accountId: string, contactId: string, templateName: string, language: string = 'en_US', components: any[] = []) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new Error('Contact not found');

    const message = await this.createMessage({
      organizationId: orgId,
      whatsappAccountId: accountId,
      contactId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
      content: { templateName, components, body: `[Template: ${templateName}]` },
      status: MessageStatus.PENDING,
    });

    try {
      const response = await this.whatsapp.sendTemplateMessage(orgId, accountId, contact.phone, templateName, language, components);
      const waMessageId = response.messages?.[0]?.id;

      return await this.prisma.message.update({
        where: { id: message.id },
        data: {
          waMessageId,
          status: MessageStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send template message: ${error.message}`);
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failureReason: error.message,
          failedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Updates message status based on WhatsApp webhook (SENT, DELIVERED, READ).
   */
  async updateMessageStatus(waMessageId: string, status: MessageStatus) {
    const message = await this.prisma.message.update({
      where: { waMessageId },
      data: {
        status,
        deliveredAt: status === MessageStatus.DELIVERED ? new Date() : undefined,
        readAt: status === MessageStatus.READ ? new Date() : undefined,
      },
    });

    this.realtimeGateway.emitMessageStatusUpdate(message.organizationId, message);
    return message;
  }

  /**
   * Retrieves historical messages for a specific conversation.
   */
  async getConversationMessages(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  /**
   * Retrieves all conversations for an organization with contact details.
   */
  async getConversations(orgId: string) {
    return this.prisma.conversation.findMany({
      where: { organizationId: orgId },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  /**
   * Proactively starts a new conversation by creating/finding a contact first.
   */
  async startNewConversation(
    orgId: string, 
    accountId: string, 
    phoneNumber: string, 
    contactInfo?: { firstName?: string; lastName?: string }
  ) {
    // 1. Ensure contact exists
    const contact = await this.contactsService.createOrUpdate(orgId, phoneNumber, contactInfo || {});

    // 2. Find or create conversation
    const conversation = await this.findOrCreateConversation(orgId, accountId, contact.id);

    // 3. Return full conversation with contact included for frontend
    return this.prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });
  }
}
