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
var WebhookProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
const contacts_service_1 = require("../contacts/contacts.service");
const messaging_service_1 = require("../messaging/messaging.service");
const client_1 = require("@prisma/client");
let WebhookProcessor = WebhookProcessor_1 = class WebhookProcessor {
    prisma;
    contactsService;
    messagingService;
    logger = new common_1.Logger(WebhookProcessor_1.name);
    constructor(prisma, contactsService, messagingService) {
        this.prisma = prisma;
        this.contactsService = contactsService;
        this.messagingService = messagingService;
    }
    async handleProcessMessage(job) {
        const { eventId, accountId, organizationId, data } = job.data;
        this.logger.log(`Processing message for event ${eventId}`);
        try {
            const contactData = data.contacts?.[0];
            const messageData = data.messages?.[0];
            if (!messageData) {
                this.logger.warn(`No message data in event ${eventId}`);
                return;
            }
            const waMessageId = messageData.id;
            const from = messageData.from;
            const incomingName = contactData?.profile?.name;
            const existingContact = await this.prisma.contact.findUnique({
                where: { organizationId_phone: { organizationId, phone: from } }
            });
            const updateData = {
                whatsappId: contactData?.wa_id || existingContact?.whatsappId,
            };
            if (incomingName && (!existingContact?.firstName || existingContact.firstName === 'WhatsApp User' || existingContact.firstName === from)) {
                updateData.firstName = incomingName;
            }
            const contact = await this.contactsService.createOrUpdate(organizationId, from, updateData);
            let messageType = client_1.MessageType.TEXT;
            let content = {};
            if (messageData.type === 'text') {
                messageType = client_1.MessageType.TEXT;
                content = { body: messageData.text.body };
            }
            else if (messageData.type === 'image') {
                messageType = client_1.MessageType.IMAGE;
                content = { image: messageData.image };
            }
            await this.messagingService.createMessage({
                organizationId,
                whatsappAccountId: accountId,
                contactId: contact.id,
                waMessageId,
                direction: client_1.MessageDirection.INBOUND,
                type: messageType,
                status: client_1.MessageStatus.READ,
                content,
                sentAt: new Date(parseInt(messageData.timestamp) * 1000),
            });
            await this.prisma.webhookEvent.update({
                where: { id: eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });
            this.logger.log(`Successfully processed message ${waMessageId}`);
        }
        catch (error) {
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
};
exports.WebhookProcessor = WebhookProcessor;
__decorate([
    (0, bull_1.Process)('process-message'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], WebhookProcessor.prototype, "handleProcessMessage", null);
exports.WebhookProcessor = WebhookProcessor = WebhookProcessor_1 = __decorate([
    (0, bull_1.Processor)('webhooks'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        contacts_service_1.ContactsService,
        messaging_service_1.MessagingService])
], WebhookProcessor);
//# sourceMappingURL=webhook.processor.js.map