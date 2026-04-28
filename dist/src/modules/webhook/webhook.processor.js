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
const flow_executor_service_1 = require("../chatbots/executor/flow-executor.service");
let WebhookProcessor = WebhookProcessor_1 = class WebhookProcessor {
    prisma;
    contactsService;
    messagingService;
    flowExecutor;
    logger = new common_1.Logger(WebhookProcessor_1.name);
    constructor(prisma, contactsService, messagingService, flowExecutor) {
        this.prisma = prisma;
        this.contactsService = contactsService;
        this.messagingService = messagingService;
        this.flowExecutor = flowExecutor;
    }
    async handleProcessMessage(job) {
        const { eventId, accountId, organizationId, data } = job.data;
        this.logger.log(`Processing message for event ${eventId}`);
        try {
            if (data.statuses && data.statuses.length > 0) {
                await this.handleStatusUpdate(data.statuses[0]);
            }
            if (data.messages && data.messages.length > 0) {
                await this.handleIncomingMessage(accountId, organizationId, data.contacts?.[0], data.messages[0]);
            }
            await this.prisma.webhookEvent.update({
                where: { id: eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });
            this.logger.log(`Successfully processed event ${eventId}`);
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
    async handleStatusUpdate(statusData) {
        const waMessageId = statusData.id;
        const metaStatus = statusData.status;
        let status = client_1.MessageStatus.SENT;
        if (metaStatus === 'delivered')
            status = client_1.MessageStatus.DELIVERED;
        else if (metaStatus === 'read')
            status = client_1.MessageStatus.READ;
        else if (metaStatus === 'failed')
            status = client_1.MessageStatus.FAILED;
        this.logger.debug(`Updating status for message ${waMessageId} to ${status}`);
        await this.messagingService.updateMessageStatus(waMessageId, status);
    }
    async handleIncomingMessage(accountId, organizationId, contactData, messageData) {
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
            content = { image: messageData.image, body: messageData.image.caption || '[Image]' };
        }
        else if (messageData.type === 'video') {
            messageType = client_1.MessageType.VIDEO;
            content = { video: messageData.video, body: messageData.video.caption || '[Video]' };
        }
        else if (messageData.type === 'document') {
            messageType = client_1.MessageType.DOCUMENT;
            content = { document: messageData.document, body: messageData.document.filename || '[Document]' };
        }
        else if (messageData.type === 'interactive') {
            messageType = client_1.MessageType.TEXT;
            const it = messageData.interactive.type;
            if (it === 'button_reply') {
                content = {
                    body: messageData.interactive.button_reply?.title || '[Button Reply]',
                    payload: messageData.interactive.button_reply?.id,
                };
            }
            else if (it === 'list_reply') {
                content = {
                    body: messageData.interactive.list_reply?.title || '[List Reply]',
                    payload: messageData.interactive.list_reply?.id,
                };
            }
            else {
                content = {
                    body: messageData.interactive[it]?.title || '[Interactive]',
                    payload: messageData.interactive[it]?.id,
                };
            }
        }
        else if (messageData.type === 'button') {
            messageType = client_1.MessageType.TEXT;
            content = { body: messageData.button.text, payload: messageData.button.payload };
        }
        else if (messageData.type === 'audio') {
            messageType = client_1.MessageType.AUDIO;
            content = { audio: messageData.audio, body: '[Audio]' };
        }
        const savedMessage = await this.messagingService.createMessage({
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
        try {
            const existingSession = await this.prisma.chatbotSession.findFirst({
                where: { contactId: contact.id, organizationId, status: client_1.ChatbotSessionStatus.WAITING_REPLY }
            });
            if (existingSession) {
                await this.flowExecutor.resumeSession(existingSession, contact, messageData);
                return;
            }
            const activeBots = await this.prisma.chatbot.findMany({
                where: { organizationId, status: 'ACTIVE', channel: 'WHATSAPP' }
            });
            let matched = null;
            const msgText = messageData.text?.body?.toLowerCase() ?? '';
            matched = activeBots.find(b => b.triggerType === 'KEYWORD_MATCH' &&
                b.keywords.some(k => msgText.includes(k.toLowerCase())));
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
        }
        catch (err) {
            this.logger.error(`Error processing chatbot flow logic: ${err.message}`);
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
        messaging_service_1.MessagingService,
        flow_executor_service_1.FlowExecutorService])
], WebhookProcessor);
//# sourceMappingURL=webhook.processor.js.map