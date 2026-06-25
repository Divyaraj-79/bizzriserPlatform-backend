import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  async findOrCreateConversation(orgId: string, accountId: string, contactId: string, isBroadcast: boolean = false) {
    try {
      return await this.prisma.conversation.upsert({
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
          section: isBroadcast ? 'BROADCAST' : 'PRIMARY'
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Unique constraint failed on the fields: (`organizationId`,`whatsappAccountId`,`contactId`)
        // Another thread just created this conversation, so we can just find it.
        const existing = await this.prisma.conversation.findUnique({
          where: {
            organizationId_whatsappAccountId_contactId: {
              organizationId: orgId,
              whatsappAccountId: accountId,
              contactId,
            },
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Internal message creation with Realtime sync.
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
    const isBroadcast = !!data.metadata?.campaignId;
    const conversation = await this.findOrCreateConversation(
      data.organizationId,
      data.whatsappAccountId,
      data.contactId,
      isBroadcast
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

    // Skip calculateWindow() for chatbot-sent messages — it's only needed by the UI
    // and adds an extra DB round-trip per bot message on remote/cloud databases.
    const isBotMessage = !!(data.metadata as any)?.isChatbot;
    const window = isBotMessage ? { isInWindow: true, windowExpiresAt: null } : await this.calculateWindow(data.contactId);

    const isManualOutbound = !isBroadcast && data.direction === MessageDirection.OUTBOUND;
    const isInbound = data.direction === MessageDirection.INBOUND;

    let updateData: any = {
      lastMessageBody: body,
      lastMessageAt: message.sentAt || message.createdAt,
      ...(isInbound ? { unreadCount: { increment: 1 } } : {}),
    };

    if (isManualOutbound || isInbound) {
      updateData.section = 'PRIMARY';
    }

    const updatedConversation: any = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: updateData,
      include: {
        contact: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            phone: true, 
            avatarUrl: true, 
            createdAt: true, 
            customFields: true, 
            tags: true, 
            status: true,
          }
        },
        whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
      }
    });

    const enrichedConv = {
      ...updatedConversation,
      contact: {
        ...updatedConversation.contact,
        ...window
      }
    };

    this.logger.debug(`[RT] Emitting message:new and conversation:update to org_${data.organizationId}`);
    this.realtimeGateway.emitNewMessage(data.organizationId, { ...message, conversationId: conversation.id });
    this.realtimeGateway.emitConversationUpdate(data.organizationId, enrichedConv);

    return message;
  }

  /**
   * REST API: Sends text message.
   */
  async sendTextMessage(orgId: string, accountId: string, contactId: string, text: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId, organizationId: orgId } });
    if (!contact) throw new NotFoundException('Contact not found');

    // Check window for templates requirement
    const window = await this.calculateWindow(contactId);
    if (!window.isInWindow && !text.startsWith('TEMPLATE:')) {
       // Optional: We could throw an error here, but we'll let the WhatsApp API handle it or the UI prevent it.
       this.logger.warn(`Attempting to send free-text to contact ${contact.phone} outside 24h window.`);
    }

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
      const response = await this.whatsapp.sendTextMessage(orgId, accountId, contact.phone, text);
      return this.prisma.message.update({
        where: { id: message.id },
        data: { waMessageId: response.messages?.[0]?.id, status: MessageStatus.SENT, sentAt: new Date() },
      });
    } catch (error: any) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: MessageStatus.FAILED, metadata: { error: error.message } },
      });
      throw error;
    }
  }

  /**
   * REST API: Sends media message.
   */
  async sendMediaMessage(orgId: string, accountId: string, contactId: string, file: any, caption?: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId, organizationId: orgId } });
    if (!contact) throw new NotFoundException('Contact not found');

    // 1. Upload to Meta
    const mediaRes = await this.whatsapp.uploadMedia(orgId, accountId, file);
    const mediaId = mediaRes.id;

    // 2. Map file type to MessageType
    let type: MessageType = MessageType.IMAGE;
    if (file.mimetype.startsWith('video')) type = MessageType.VIDEO;
    else if (file.mimetype.startsWith('audio')) type = MessageType.AUDIO;
    else if (!file.mimetype.startsWith('image')) type = MessageType.DOCUMENT;

    const message = await this.createMessage({
      organizationId: orgId,
      whatsappAccountId: accountId,
      contactId,
      direction: MessageDirection.OUTBOUND,
      type,
      content: { mediaId, caption, filename: file.originalname },
      status: MessageStatus.PENDING,
    });

    try {
      const response = await this.whatsapp.sendMediaMessage(orgId, accountId, contact.phone, type, mediaId, caption);
      return this.prisma.message.update({
        where: { id: message.id },
        data: { waMessageId: response.messages?.[0]?.id, status: MessageStatus.SENT, sentAt: new Date() },
      });
    } catch (error: any) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: MessageStatus.FAILED, metadata: { error: error.message } },
      });
      throw error;
    }
  }

  /**
   * REST API: Template dispatch.
   */
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
         if (recipient && recipient.status !== MessageStatus.FAILED) {
            const oldStatus = recipient.status;
            await this.prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: MessageStatus.FAILED, failedAt: new Date(), failureReason: `API_ERROR: ${error.message}` } as any
            });

            // Also update campaign stats inline (absolute count)
            const stats = await this.prisma.campaignRecipient.groupBy({
               by: ['status'],
               where: { campaignId: metadata.campaignId },
               _count: { status: true }
            });

            const updateData = { sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0 };
            for (const stat of stats) {
               const count = stat._count.status;
               if (stat.status === MessageStatus.SENT) updateData.sentCount += count;
               if (stat.status === MessageStatus.DELIVERED) {
                  updateData.sentCount += count;
                  updateData.deliveredCount += count;
               }
               if (stat.status === MessageStatus.READ) {
                  updateData.sentCount += count;
                  updateData.deliveredCount += count;
                  updateData.readCount += count;
               }
               if (stat.status === MessageStatus.FAILED) updateData.failedCount += count;
            }

            const updatedCampaign = await this.prisma.campaign.update({
              where: { id: metadata.campaignId },
              data: updateData
            });
            this.realtimeGateway.emitCampaignUpdate(updatedCampaign.organizationId, updatedCampaign);
         }
      }
      throw error;
    }
  }

  /**
   * REST API: Initialize new chat.
   */
  async startNewConversation(orgId: string, accountId: string, phone: string, data: { firstName?: string; lastName?: string }) {
    const contact = await this.contactsService.createOrUpdate(orgId, phone, data);
    return this.findOrCreateConversation(orgId, accountId, contact.id);
  }

  private messageLocks = new Map<string, Promise<any>>();

  /**
   * Internal: Sync status for webhooks.
   */
  async updateMessageStatus(waMessageId: string, status: MessageStatus, failureReason?: string) {
    const currentLock = this.messageLocks.get(waMessageId) || Promise.resolve();
    
    const nextPromise = currentLock.then(async () => {
       const message = await this.prisma.message.findUnique({
         where: { waMessageId },
         select: { id: true, organizationId: true, metadata: true, status: true, contactId: true, deliveredAt: true, readAt: true }
       });

    if (!message) return null;

    const statusOrder: Record<string, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
    const currentOrder = statusOrder[message.status] || 0;
    const newOrder = statusOrder[status] || 0;

    const data: any = {};
    if (status === MessageStatus.DELIVERED) {
       if (!message.deliveredAt) data.deliveredAt = new Date();
    } else if (status === MessageStatus.READ) {
       if (!message.readAt) data.readAt = new Date();
       if (!message.deliveredAt) data.deliveredAt = new Date();
    } else if (status === MessageStatus.FAILED) {
       data.failedAt = new Date();
       data.failureReason = failureReason;
    }

    if (status === MessageStatus.FAILED || newOrder > currentOrder) {
       data.status = status;
    }

    let updatedMessage = message;
    if (Object.keys(data).length > 0) {
       updatedMessage = await this.prisma.message.update({
         where: { id: message.id },
         data
       });
    }

    const metadata = message.metadata as any;
    if (metadata?.campaignId) {
      const campaignId = metadata.campaignId;
      const recipient = await this.prisma.campaignRecipient.findFirst({
         where: { campaignId, contactId: updatedMessage.contactId }
      });
      if (recipient) {
         const oldRecipientStatus = recipient.status;
         const currentRecipientOrder = statusOrder[oldRecipientStatus] || 0;

         const recipientUpdate: any = {};
         if (status === MessageStatus.SENT && !recipient.sentAt) recipientUpdate.sentAt = new Date();
         else if (status === MessageStatus.DELIVERED && !recipient.deliveredAt) recipientUpdate.deliveredAt = new Date();
         else if (status === MessageStatus.READ) {
            if (!recipient.readAt) recipientUpdate.readAt = new Date();
            if (!recipient.deliveredAt) recipientUpdate.deliveredAt = new Date();
         }
         else if (status === MessageStatus.FAILED && !recipient.failedAt) {
            recipientUpdate.failedAt = new Date();
            recipientUpdate.failureReason = failureReason || 'WEBHOOK_FAILED';
         }

         let finalStatus = oldRecipientStatus;
         if (status === MessageStatus.FAILED || newOrder > currentRecipientOrder) {
            recipientUpdate.status = status;
            finalStatus = status;
         }

         if (Object.keys(recipientUpdate).length > 0) {
            await this.prisma.campaignRecipient.update({
               where: { id: recipient.id },
               data: recipientUpdate as any
            });

            if (oldRecipientStatus !== finalStatus) {
               const getCountContribution = (st: string) => ({
                 sent: (st === 'SENT' || st === 'DELIVERED' || st === 'READ') ? 1 : 0,
                 delivered: (st === 'DELIVERED' || st === 'READ') ? 1 : 0,
                 read: (st === 'READ') ? 1 : 0,
                 failed: (st === 'FAILED') ? 1 : 0
               });
               
               const oldCont = getCountContribution(oldRecipientStatus);
               const newCont = getCountContribution(finalStatus);
               
               const updateData: any = {};
               if (newCont.sent - oldCont.sent !== 0) updateData.sentCount = { increment: newCont.sent - oldCont.sent };
               if (newCont.delivered - oldCont.delivered !== 0) updateData.deliveredCount = { increment: newCont.delivered - oldCont.delivered };
               if (newCont.read - oldCont.read !== 0) updateData.readCount = { increment: newCont.read - oldCont.read };
               if (newCont.failed - oldCont.failed !== 0) updateData.failedCount = { increment: newCont.failed - oldCont.failed };

               if (Object.keys(updateData).length > 0) {
                 const updatedCampaign = await this.prisma.campaign.update({
                   where: { id: campaignId },
                   data: updateData
                 });
                 this.realtimeGateway.emitCampaignUpdate(updatedCampaign.organizationId, updatedCampaign);
               }
            }
         }
      }
    }

    this.realtimeGateway.emitMessageStatusUpdate(updatedMessage.organizationId, updatedMessage);
    return updatedMessage;
    }).catch(e => {
       this.logger.error(`Status update error: ${e.message}`, e.stack);
       throw e;
    });

    this.messageLocks.set(waMessageId, nextPromise);
    nextPromise.finally(() => {
       if (this.messageLocks.get(waMessageId) === nextPromise) {
          this.messageLocks.delete(waMessageId);
       }
    });

    return nextPromise;
  }

  /**
   * Manual emission for cases where message is updated outside this service
   */
  emitMessageStatus(orgId: string, message: any) {
    this.realtimeGateway.emitMessageStatusUpdate(orgId, message);
  }

  /**
   * REST API: Fetch live chat history.
   */
  async getConversationMessages(conversationId: string, search?: string) {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { gte: fortyFiveDaysAgo },
        ...(search ? {
          content: {
            path: ['body'],
            string_contains: search
          }
        } : {})
      },
      orderBy: { createdAt: 'desc' },
    });
    return messages.reverse();
  }

  /**
   * Export Chat functionality (up to 90 days)
   */
  async exportConversationChat(orgId: string, conversationId: string): Promise<string> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: { select: { firstName: true, lastName: true, phone: true } },
      }
    });

    if (!conversation || conversation.organizationId !== orgId) {
      throw new NotFoundException('Conversation not found');
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { gte: ninetyDaysAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    const contactName = conversation.contact.firstName || conversation.contact.lastName 
      ? `${conversation.contact.firstName || ''} ${conversation.contact.lastName || ''}`.trim()
      : conversation.contact.phone;

    let exportText = `WhatsApp Chat Export - ${contactName}\n`;
    exportText += `Exported on: ${new Date().toLocaleString()}\n`;
    exportText += `=================================================\n\n`;

    for (const msg of messages) {
      const dateStr = `[${new Date(msg.createdAt).toLocaleString()}]`;
      const sender = msg.direction === 'INBOUND' ? contactName : 'Me';
      let bodyText = '';
      
      const content = msg.content as any;
      if (msg.type === 'TEXT') {
        bodyText = content?.body || '';
      } else if (msg.type === 'TEMPLATE') {
        bodyText = `[Template: ${content?.templateName || ''}]`;
      } else if (msg.type === 'IMAGE') {
        bodyText = `[Image] ${content?.caption || ''}`.trim();
      } else if (msg.type === 'VIDEO') {
        bodyText = `[Video] ${content?.caption || ''}`.trim();
      } else if (msg.type === 'DOCUMENT') {
        bodyText = `[Document] ${content?.filename || ''}`.trim();
      } else if (msg.type === 'AUDIO') {
        bodyText = `[Audio]`;
      } else {
        bodyText = content?.body || `[${msg.type}]`;
      }

      exportText += `${dateStr} ${sender}: ${bodyText}\n`;
    }

    return exportText;
  }

  async clearConversationMessages(orgId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId }
    });
    if (!conversation || conversation.organizationId !== orgId) {
      throw new NotFoundException('Conversation not found');
    }

    await this.prisma.message.deleteMany({ where: { conversationId } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageBody: null }
    });
    return { success: true };
  }

  async getConversations(orgId: string, user?: { role: string; sub: string }, section?: string, page: number = 1, limit: number = 50) {
    const isAdmin = !user || user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN';

    const whereClause: any = {
      organizationId: orgId,
      ...(isAdmin ? {} : {
        whatsappAccount: {
          accountAccess: {
            some: { userId: user.sub }
          }
        }
      })
    };

    if (section) {
      whereClause.section = section;
    }

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: whereClause,
        include: {
          contact: { 
            select: { 
              id: true, 
              firstName: true, 
              lastName: true, 
              phone: true, 
              avatarUrl: true,
              createdAt: true
            } 
          },
          whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.conversation.count({ where: whereClause })
    ]);

    // ── OPTIMIZED: Single batch query instead of N individual queries ──────────
    // Previously this was doing one DB round-trip PER conversation to find the last
    // inbound message (N+1 problem). With 20 conversations on Neon = ~1,200ms overhead.
    // Now: one query fetches all last inbound times, window is computed in memory.
    const contactIds = conversations.map(c => c.contactId);
    const now = new Date();
    const windowMap = new Map<string, { isInWindow: boolean; windowExpiresAt: Date | null }>();

    if (contactIds.length > 0) {
      // Use raw groupBy to get the latest inbound message per contact in one query
      const lastInbounds = await this.prisma.message.findMany({
        where: {
          contactId: { in: contactIds },
          direction: MessageDirection.INBOUND,
        },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
        select: { contactId: true, sentAt: true, createdAt: true },
        distinct: ['contactId'],
      });

      for (const msg of lastInbounds) {
        const lastInboundTime = msg.sentAt || msg.createdAt;
        const windowExpiresAt = lastInboundTime
          ? new Date(lastInboundTime.getTime() + 24 * 60 * 60 * 1000)
          : null;
        const isInWindow = windowExpiresAt ? windowExpiresAt > now : false;
        windowMap.set(msg.contactId, { isInWindow, windowExpiresAt });
      }
    }

    const enhanced = conversations.map((conv) => {
      const window = windowMap.get(conv.contactId) ?? { isInWindow: false, windowExpiresAt: null };
      return {
        ...conv,
        contact: {
          ...conv.contact,
          ...window,
        },
      };
    });

    return {
      data: enhanced,
      total,
      page,
      limit
    };
  }

  async markAsRead(orgId: string, conversationId: string) {
    const updatedConversation: any = await this.prisma.conversation.update({
      where: { id: conversationId, organizationId: orgId },
      data: { unreadCount: 0 },
      include: {
        contact: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            phone: true, 
            avatarUrl: true, 
            createdAt: true, 
            customFields: true, 
            tags: true, 
            status: true,
          }
        },
        whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
      }
    });

    const window = await this.calculateWindow(updatedConversation.contactId);
    const enriched = {
      ...updatedConversation,
      contact: {
        ...updatedConversation.contact,
        ...window
      }
    };

    this.realtimeGateway.emitConversationUpdate(orgId, enriched);
    return enriched;
  }

  private async calculateWindow(contactId: string) {
    const lastInbound = await this.prisma.message.findFirst({
      where: { contactId, direction: MessageDirection.INBOUND },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      select: { sentAt: true, createdAt: true }
    });

    const lastInboundTime = lastInbound?.sentAt || lastInbound?.createdAt;
    const windowExpiresAt = lastInboundTime
      ? new Date(lastInboundTime.getTime() + 24 * 60 * 60 * 1000)
      : null;
    
    const isInWindow = windowExpiresAt ? windowExpiresAt > new Date() : false;

    return { isInWindow, windowExpiresAt };
  }

  async getMediaUrl(orgId: string, accountId: string, mediaId: string) {
    return this.whatsapp.getMediaUrl(orgId, accountId, mediaId);
  }

  async downloadMedia(orgId: string, accountId: string, mediaId: string) {
    return this.whatsapp.downloadMedia(orgId, accountId, mediaId);
  }
}
