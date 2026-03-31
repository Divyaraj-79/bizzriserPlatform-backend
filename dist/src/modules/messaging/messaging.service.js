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
        if (data.type === client_1.MessageType.TEXT) {
            body = data.content.body;
        }
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
        const contact = await this.prisma.contact.findUnique({
            where: { id: contactId },
        });
        if (!contact)
            throw new Error('Contact not found');
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
            const waMessageId = response.messages?.[0]?.id;
            return await this.prisma.message.update({
                where: { id: message.id },
                data: {
                    waMessageId,
                    status: client_1.MessageStatus.SENT,
                    sentAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error(`Failed to send message: ${error.message}`);
            await this.prisma.message.update({
                where: { id: message.id },
                data: {
                    status: client_1.MessageStatus.FAILED,
                    failureReason: error.message,
                    failedAt: new Date(),
                },
            });
            throw error;
        }
    }
    async sendTemplateMessage(orgId, accountId, contactId, templateName, language = 'en_US', components = []) {
        const contact = await this.prisma.contact.findUnique({
            where: { id: contactId },
        });
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
        });
        try {
            const response = await this.whatsapp.sendTemplateMessage(orgId, accountId, contact.phone, templateName, language, components);
            const waMessageId = response.messages?.[0]?.id;
            return await this.prisma.message.update({
                where: { id: message.id },
                data: {
                    waMessageId,
                    status: client_1.MessageStatus.SENT,
                    sentAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error(`Failed to send template message: ${error.message}`);
            await this.prisma.message.update({
                where: { id: message.id },
                data: {
                    status: client_1.MessageStatus.FAILED,
                    failureReason: error.message,
                    failedAt: new Date(),
                },
            });
            throw error;
        }
    }
    async updateMessageStatus(waMessageId, status) {
        const message = await this.prisma.message.update({
            where: { waMessageId },
            data: {
                status,
                deliveredAt: status === client_1.MessageStatus.DELIVERED ? new Date() : undefined,
                readAt: status === client_1.MessageStatus.READ ? new Date() : undefined,
            },
        });
        this.realtimeGateway.emitMessageStatusUpdate(message.organizationId, message);
        return message;
    }
    async getConversationMessages(conversationId) {
        return this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 50,
        });
    }
    async getConversations(orgId) {
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
    async startNewConversation(orgId, accountId, phoneNumber, contactInfo) {
        const contact = await this.contactsService.createOrUpdate(orgId, phoneNumber, contactInfo || {});
        const conversation = await this.findOrCreateConversation(orgId, accountId, contact.id);
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