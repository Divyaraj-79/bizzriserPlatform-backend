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
    async findOrCreateConversation(orgId, accountId, contactId) {
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
    async createMessage(data) {
        const conversation = await this.findOrCreateConversation(data.organizationId, data.whatsappAccountId, data.contactId);
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
    async sendTextMessage(orgId, accountId, contactId, text) {
        const contact = await this.prisma.contact.findUnique({ where: { id: contactId, organizationId: orgId } });
        if (!contact)
            throw new common_1.NotFoundException('Contact not found');
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
                if (recipient) {
                    await this.prisma.campaignRecipient.update({
                        where: { id: recipient.id },
                        data: { status: client_1.MessageStatus.FAILED, failedAt: new Date(), failureReason: error.message }
                    });
                }
            }
            throw error;
        }
    }
    async startNewConversation(orgId, accountId, phone, data) {
        const contact = await this.contactsService.createOrUpdate(orgId, phone, data);
        return this.findOrCreateConversation(orgId, accountId, contact.id);
    }
    async updateMessageStatus(waMessageId, status, failureReason) {
        const message = await this.prisma.message.findUnique({
            where: { waMessageId },
            select: { id: true, organizationId: true, metadata: true, status: true, contactId: true }
        });
        if (!message)
            return null;
        if (message.status === status)
            return message;
        const data = { status };
        if (status === client_1.MessageStatus.DELIVERED)
            data.deliveredAt = new Date();
        else if (status === client_1.MessageStatus.READ)
            data.readAt = new Date();
        else if (status === client_1.MessageStatus.FAILED) {
            data.failedAt = new Date();
            data.failureReason = failureReason;
        }
        const updatedMessage = await this.prisma.message.update({
            where: { id: message.id },
            data
        });
        const metadata = message.metadata;
        if (metadata?.campaignId) {
            const campaignId = metadata.campaignId;
            const updateData = {};
            const recipientUpdate = { status };
            if (status === client_1.MessageStatus.DELIVERED) {
                updateData.deliveredCount = { increment: 1 };
                recipientUpdate.deliveredAt = new Date();
            }
            else if (status === client_1.MessageStatus.READ) {
                updateData.readCount = { increment: 1 };
                recipientUpdate.readAt = new Date();
            }
            else if (status === client_1.MessageStatus.FAILED) {
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
    async getConversationMessages(conversationId) {
        return this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 100,
        });
    }
    async getConversations(orgId, user) {
        const isAdmin = !user || user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN';
        return this.prisma.conversation.findMany({
            where: {
                organizationId: orgId,
                ...(isAdmin ? {} : {
                    whatsappAccount: {
                        accountAccess: {
                            some: { userId: user.sub }
                        }
                    }
                })
            },
            include: {
                contact: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
                whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
            },
            orderBy: { lastMessageAt: 'desc' },
        });
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