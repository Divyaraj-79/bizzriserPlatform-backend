"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MessagingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const contacts_service_1 = require("../contacts/contacts.service");
const client_1 = require("@prisma/client");
let MessagingService = MessagingService_1 = class MessagingService {
    prisma;
    whatsapp;
    realtimeGateway;
    contactsService;
    logger = new common_1.Logger(MessagingService_1.name);
    constructor(prisma, whatsapp, realtimeGateway, contactsService) {
        this.prisma = prisma;
        this.whatsapp = whatsapp;
        this.realtimeGateway = realtimeGateway;
        this.contactsService = contactsService;
    }
    async findOrCreateConversation(orgId, accountId, contactId, isBroadcast = false) {
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
        }
        catch (error) {
            if (error.code === 'P2002') {
                const existing = await this.prisma.conversation.findUnique({
                    where: {
                        organizationId_whatsappAccountId_contactId: {
                            organizationId: orgId,
                            whatsappAccountId: accountId,
                            contactId,
                        },
                    },
                });
                if (existing)
                    return existing;
            }
            throw error;
        }
    }
    async createMessage(data) {
        const isBroadcast = !!data.metadata?.campaignId;
        const conversation = await this.findOrCreateConversation(data.organizationId, data.whatsappAccountId, data.contactId, isBroadcast);
        const message = await this.prisma.message.create({
            data: {
                ...data,
                conversationId: conversation.id,
            },
        });
        let body = 'Media message';
        if (data.type === client_1.MessageType.TEXT)
            body = data.content.body;
        else if (data.type === client_1.MessageType.TEMPLATE)
            body = `Template: ${data.content.templateName}`;
        const isBotMessage = !!data.metadata?.isChatbot;
        const window = isBotMessage ? { isInWindow: true, windowExpiresAt: null } : await this.calculateWindow(data.contactId);
        const isManualOutbound = !isBroadcast && data.direction === client_1.MessageDirection.OUTBOUND;
        const isInbound = data.direction === client_1.MessageDirection.INBOUND;
        let updateData = {
            lastMessageBody: body,
            lastMessageAt: message.sentAt || message.createdAt,
            ...(isInbound ? { unreadCount: { increment: 1 } } : {}),
        };
        if (isManualOutbound || isInbound) {
            updateData.section = 'PRIMARY';
        }
        const updatedConversation = await this.prisma.conversation.update({
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
    async sendTextMessage(orgId, accountId, contactId, text) {
        const contact = await this.prisma.contact.findUnique({ where: { id: contactId, organizationId: orgId } });
        if (!contact)
            throw new common_1.NotFoundException('Contact not found');
        const window = await this.calculateWindow(contactId);
        if (!window.isInWindow && !text.startsWith('TEMPLATE:')) {
            this.logger.warn(`Attempting to send free-text to contact ${contact.phone} outside 24h window.`);
        }
        const message = await this.createMessage({
            organizationId: orgId,
            whatsappAccountId: accountId,
            contactId,
            direction: client_1.MessageDirection.OUTBOUND,
            type: client_1.MessageType.TEXT,
            content: { body: text },
            status: client_1.MessageStatus.PENDING,
        });
        try {
            const response = await this.whatsapp.sendTextMessage(orgId, accountId, contact.phone, text);
            return this.prisma.message.update({
                where: { id: message.id },
                data: { waMessageId: response.messages?.[0]?.id, status: client_1.MessageStatus.SENT, sentAt: new Date() },
            });
        }
        catch (error) {
            await this.prisma.message.update({
                where: { id: message.id },
                data: { status: client_1.MessageStatus.FAILED, metadata: { error: error.message } },
            });
            throw error;
        }
    }
    async sendMediaMessage(orgId, accountId, contactId, file, caption) {
        const contact = await this.prisma.contact.findUnique({ where: { id: contactId, organizationId: orgId } });
        if (!contact)
            throw new common_1.NotFoundException('Contact not found');
        const mediaRes = await this.whatsapp.uploadMedia(orgId, accountId, file);
        const mediaId = mediaRes.id;
        let type = client_1.MessageType.IMAGE;
        if (file.mimetype.startsWith('video'))
            type = client_1.MessageType.VIDEO;
        else if (file.mimetype.startsWith('audio'))
            type = client_1.MessageType.AUDIO;
        else if (!file.mimetype.startsWith('image'))
            type = client_1.MessageType.DOCUMENT;
        const message = await this.createMessage({
            organizationId: orgId,
            whatsappAccountId: accountId,
            contactId,
            direction: client_1.MessageDirection.OUTBOUND,
            type,
            content: { mediaId, caption, filename: file.originalname },
            status: client_1.MessageStatus.PENDING,
        });
        try {
            const response = await this.whatsapp.sendMediaMessage(orgId, accountId, contact.phone, type, mediaId, caption);
            return this.prisma.message.update({
                where: { id: message.id },
                data: { waMessageId: response.messages?.[0]?.id, status: client_1.MessageStatus.SENT, sentAt: new Date() },
            });
        }
        catch (error) {
            await this.prisma.message.update({
                where: { id: message.id },
                data: { status: client_1.MessageStatus.FAILED, metadata: { error: error.message } },
            });
            throw error;
        }
    }
    async sendTemplateMessage(orgId, accountId, contactId, templateName, language = 'en_US', components = [], metadata = {}) {
        const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
        if (!contact)
            throw new Error('Contact not found');
        const message = await this.createMessage({
            organizationId: orgId,
            whatsappAccountId: accountId,
            contactId,
            direction: client_1.MessageDirection.OUTBOUND,
            type: client_1.MessageType.TEMPLATE,
            content: { templateName, components, body: `[Template: ${templateName}]` },
            status: client_1.MessageStatus.PENDING,
            metadata
        });
        try {
            const response = await this.whatsapp.sendTemplateMessage(orgId, accountId, contact.phone, templateName, language, components);
            const waMessageId = response.messages?.[0]?.id;
            return await this.prisma.message.update({
                where: { id: message.id },
                data: { waMessageId, status: client_1.MessageStatus.SENT, sentAt: new Date() },
            });
        }
        catch (error) {
            this.logger.error(`Failed to send template message: ${error.message}`);
            await this.prisma.message.update({
                where: { id: message.id },
                data: { status: client_1.MessageStatus.FAILED, failureReason: error.message, failedAt: new Date() },
            });
            if (metadata?.campaignId) {
                const recipient = await this.prisma.campaignRecipient.findFirst({
                    where: { campaignId: metadata.campaignId, contactId }
                });
                if (recipient && recipient.status !== client_1.MessageStatus.FAILED) {
                    const oldStatus = recipient.status;
                    await this.prisma.campaignRecipient.update({
                        where: { id: recipient.id },
                        data: { status: client_1.MessageStatus.FAILED, failedAt: new Date(), failureReason: `API_ERROR: ${error.message}` }
                    });
                    const stats = await this.prisma.campaignRecipient.groupBy({
                        by: ['status'],
                        where: { campaignId: metadata.campaignId },
                        _count: { status: true }
                    });
                    const updateData = { sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0 };
                    for (const stat of stats) {
                        const count = stat._count.status;
                        if (stat.status === client_1.MessageStatus.SENT)
                            updateData.sentCount += count;
                        if (stat.status === client_1.MessageStatus.DELIVERED) {
                            updateData.sentCount += count;
                            updateData.deliveredCount += count;
                        }
                        if (stat.status === client_1.MessageStatus.READ) {
                            updateData.sentCount += count;
                            updateData.deliveredCount += count;
                            updateData.readCount += count;
                        }
                        if (stat.status === client_1.MessageStatus.FAILED)
                            updateData.failedCount += count;
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
    async startNewConversation(orgId, accountId, phone, data) {
        const contact = await this.contactsService.createOrUpdate(orgId, phone, data);
        return this.findOrCreateConversation(orgId, accountId, contact.id);
    }
    messageLocks = new Map();
    async updateMessageStatus(waMessageId, status, failureReason) {
        const currentLock = this.messageLocks.get(waMessageId) || Promise.resolve();
        const nextPromise = currentLock.then(async () => {
            const message = await this.prisma.message.findUnique({
                where: { waMessageId },
                select: { id: true, organizationId: true, metadata: true, status: true, contactId: true, deliveredAt: true, readAt: true }
            });
            if (!message)
                return null;
            const statusOrder = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
            const currentOrder = statusOrder[message.status] || 0;
            const newOrder = statusOrder[status] || 0;
            const data = {};
            if (status === client_1.MessageStatus.DELIVERED) {
                if (!message.deliveredAt)
                    data.deliveredAt = new Date();
            }
            else if (status === client_1.MessageStatus.READ) {
                if (!message.readAt)
                    data.readAt = new Date();
                if (!message.deliveredAt)
                    data.deliveredAt = new Date();
            }
            else if (status === client_1.MessageStatus.FAILED) {
                data.failedAt = new Date();
                data.failureReason = failureReason;
            }
            if (status === client_1.MessageStatus.FAILED || newOrder > currentOrder) {
                data.status = status;
            }
            let updatedMessage = message;
            if (Object.keys(data).length > 0) {
                updatedMessage = await this.prisma.message.update({
                    where: { id: message.id },
                    data
                });
            }
            const metadata = message.metadata;
            if (metadata?.campaignId) {
                const campaignId = metadata.campaignId;
                const recipient = await this.prisma.campaignRecipient.findFirst({
                    where: { campaignId, contactId: updatedMessage.contactId }
                });
                if (recipient) {
                    const oldRecipientStatus = recipient.status;
                    const currentRecipientOrder = statusOrder[oldRecipientStatus] || 0;
                    const recipientUpdate = {};
                    if (status === client_1.MessageStatus.SENT && !recipient.sentAt)
                        recipientUpdate.sentAt = new Date();
                    else if (status === client_1.MessageStatus.DELIVERED && !recipient.deliveredAt)
                        recipientUpdate.deliveredAt = new Date();
                    else if (status === client_1.MessageStatus.READ) {
                        if (!recipient.readAt)
                            recipientUpdate.readAt = new Date();
                        if (!recipient.deliveredAt)
                            recipientUpdate.deliveredAt = new Date();
                    }
                    else if (status === client_1.MessageStatus.FAILED && !recipient.failedAt) {
                        recipientUpdate.failedAt = new Date();
                        recipientUpdate.failureReason = failureReason || 'WEBHOOK_FAILED';
                    }
                    let finalStatus = oldRecipientStatus;
                    if (status === client_1.MessageStatus.FAILED || newOrder > currentRecipientOrder) {
                        recipientUpdate.status = status;
                        finalStatus = status;
                    }
                    if (Object.keys(recipientUpdate).length > 0) {
                        await this.prisma.campaignRecipient.update({
                            where: { id: recipient.id },
                            data: recipientUpdate
                        });
                        if (oldRecipientStatus !== finalStatus) {
                            const getCountContribution = (st) => ({
                                sent: (st === 'SENT' || st === 'DELIVERED' || st === 'READ') ? 1 : 0,
                                delivered: (st === 'DELIVERED' || st === 'READ') ? 1 : 0,
                                read: (st === 'READ') ? 1 : 0,
                                failed: (st === 'FAILED') ? 1 : 0
                            });
                            const oldCont = getCountContribution(oldRecipientStatus);
                            const newCont = getCountContribution(finalStatus);
                            const updateData = {};
                            if (newCont.sent - oldCont.sent !== 0)
                                updateData.sentCount = { increment: newCont.sent - oldCont.sent };
                            if (newCont.delivered - oldCont.delivered !== 0)
                                updateData.deliveredCount = { increment: newCont.delivered - oldCont.delivered };
                            if (newCont.read - oldCont.read !== 0)
                                updateData.readCount = { increment: newCont.read - oldCont.read };
                            if (newCont.failed - oldCont.failed !== 0)
                                updateData.failedCount = { increment: newCont.failed - oldCont.failed };
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
    emitMessageStatus(orgId, message) {
        this.realtimeGateway.emitMessageStatusUpdate(orgId, message);
    }
    async getConversationMessages(conversationId, search) {
        return this.prisma.message.findMany({
            where: {
                conversationId,
                ...(search ? {
                    content: {
                        path: ['body'],
                        string_contains: search
                    }
                } : {})
            },
            orderBy: { createdAt: 'asc' },
            take: 100,
        });
    }
    async clearConversationMessages(orgId, conversationId) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId }
        });
        if (!conversation || conversation.organizationId !== orgId) {
            throw new common_1.NotFoundException('Conversation not found');
        }
        await this.prisma.message.deleteMany({ where: { conversationId } });
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageBody: null }
        });
        return { success: true };
    }
    async getConversations(orgId, user, section, page = 1, limit = 50) {
        const isAdmin = !user || user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN';
        const whereClause = {
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
        const enhanced = await Promise.all(conversations.map(async (conv) => {
            const lastInbound = await this.prisma.message.findFirst({
                where: { contactId: conv.contactId, direction: client_1.MessageDirection.INBOUND },
                orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
                select: { sentAt: true, createdAt: true }
            });
            const lastInboundTime = lastInbound?.sentAt || lastInbound?.createdAt;
            const windowExpiresAt = lastInboundTime
                ? new Date(lastInboundTime.getTime() + 24 * 60 * 60 * 1000)
                : null;
            const isInWindow = windowExpiresAt ? windowExpiresAt > new Date() : false;
            return {
                ...conv,
                contact: {
                    ...conv.contact,
                    isInWindow,
                    windowExpiresAt
                }
            };
        }));
        return {
            data: enhanced,
            total,
            page,
            limit
        };
    }
    async markAsRead(orgId, conversationId) {
        const updatedConversation = await this.prisma.conversation.update({
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
    async calculateWindow(contactId) {
        const lastInbound = await this.prisma.message.findFirst({
            where: { contactId, direction: client_1.MessageDirection.INBOUND },
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
    async getMediaUrl(orgId, accountId, mediaId) {
        return this.whatsapp.getMediaUrl(orgId, accountId, mediaId);
    }
    async downloadMedia(orgId, accountId, mediaId) {
        return this.whatsapp.downloadMedia(orgId, accountId, mediaId);
    }
};
exports.MessagingService = MessagingService;
exports.MessagingService = MessagingService = MessagingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService,
        realtime_gateway_1.RealtimeGateway,
        contacts_service_1.ContactsService])
], MessagingService);
//# sourceMappingURL=messaging.service.js.map