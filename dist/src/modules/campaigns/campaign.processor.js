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
var CampaignProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
const messaging_service_1 = require("../messaging/messaging.service");
const campaigns_service_1 = require("./campaigns.service");
const client_1 = require("@prisma/client");
let CampaignProcessor = CampaignProcessor_1 = class CampaignProcessor {
    prisma;
    messagingService;
    campaignsService;
    logger = new common_1.Logger(CampaignProcessor_1.name);
    constructor(prisma, messagingService, campaignsService) {
        this.prisma = prisma;
        this.messagingService = messagingService;
        this.campaignsService = campaignsService;
    }
    async handleStartCampaign(job) {
        const { campaignId, orgId, accountId } = job.data;
        this.logger.log(`Scheduled campaign ${campaignId} triggered. Starting now.`);
        try {
            await this.campaignsService.startCampaign(orgId, campaignId, accountId);
        }
        catch (error) {
            this.logger.error(`Failed to start scheduled campaign ${campaignId}: ${error.message}`);
            throw error;
        }
    }
    async handleSendMessage(job) {
        const { campaignId, recipientId, orgId, accountId, contactId, templateName, templateParams } = job.data;
        this.logger.debug(`Processing campaign message for recipient ${recipientId}`);
        try {
            const campaign = await this.prisma.campaign.findUnique({
                where: { id: campaignId },
                select: { status: true, name: true, totalRecipients: true, sentCount: true, failedCount: true, metadata: true },
            });
            if (!campaign || campaign.status === 'CANCELLED') {
                this.logger.warn(`Campaign ${campaignId} is CANCELLED. Skipping message for recipient ${recipientId}.`);
                return;
            }
            const recipient = await this.prisma.campaignRecipient.findUnique({ where: { id: recipientId } });
            if (!recipient)
                throw new Error('Recipient not found');
            const oldStatus = recipient.status;
            const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
            if (!contact)
                throw new Error('Contact not found');
            const templateLanguage = campaign.metadata?.templateLanguage;
            const mappingRecord = await this.prisma.whatsAppTemplate.findFirst({
                where: {
                    accountId,
                    name: templateName,
                    language: templateLanguage || undefined
                }
            });
            const variableMapping = mappingRecord?.variableMapping || {};
            const bodyParameters = [];
            if (Object.keys(variableMapping).length > 0) {
                const broadcastParams = templateParams || [];
                Object.keys(variableMapping)
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .forEach(index => {
                    const broadcastParam = broadcastParams.find(p => String(p.index) === String(index));
                    let text = '';
                    const hasStaticValue = broadcastParam && (broadcastParam.field === '__STATIC__' || (broadcastParam.value !== undefined && broadcastParam.value !== null && broadcastParam.field === ''));
                    if (hasStaticValue || broadcastParam?.field === '__STATIC__') {
                        text = broadcastParam?.value || '';
                    }
                    else {
                        const fieldKey = broadcastParam?.field || variableMapping[index];
                        if (!fieldKey || fieldKey === '__STATIC__') {
                            text = '';
                        }
                        else if (fieldKey.startsWith('custom:')) {
                            const cfKey = fieldKey.replace('custom:', '');
                            text = contact.customFields?.[cfKey] || '';
                        }
                        else if (fieldKey.startsWith('var:')) {
                            const varKey = fieldKey.replace('var:', '');
                            text = templateParams?.[varKey] || templateParams?.find?.((p) => p.name === varKey)?.value || '';
                        }
                        else {
                            text = contact[fieldKey] || contact.customFields?.[fieldKey] || '';
                        }
                    }
                    bodyParameters.push({ type: 'text', text: String(text || '') });
                });
            }
            else {
                (templateParams || [])
                    .sort((a, b) => a.index - b.index)
                    .forEach((p) => {
                    let text = '';
                    if (p.field) {
                        text = contact[p.field] || contact.customFields?.[p.field] || '';
                    }
                    else {
                        text = p.value || '';
                    }
                    bodyParameters.push({ type: 'text', text: String(text || '') });
                });
            }
            const components = [{ type: 'body', parameters: bodyParameters }];
            const finalLanguage = templateLanguage || mappingRecord?.language || 'en_US';
            await this.messagingService.sendTemplateMessage(orgId, accountId, contactId, templateName, finalLanguage, components, { campaignId });
            await this.prisma.campaignRecipient.update({
                where: { id: recipientId },
                data: { status: client_1.MessageStatus.SENT, sentAt: new Date() },
            });
            await this.campaignsService.updateCampaignStats(campaignId, oldStatus, client_1.MessageStatus.SENT);
            const updatedCampaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
            if (updatedCampaign && updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients) {
                await this.prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: client_1.CampaignStatus.COMPLETED, completedAt: new Date() },
                });
                await this.campaignsService.log(campaignId, 'Broadcast completed successfully', client_1.CampaignLogLevel.INFO);
            }
        }
        catch (error) {
            this.logger.error(`Failed to process campaign message for recipient ${recipientId}: ${error.message}`);
            const currentRecipient = await this.prisma.campaignRecipient.findUnique({ where: { id: recipientId } });
            const currentStatus = currentRecipient?.status || client_1.MessageStatus.PENDING;
            await this.prisma.campaignRecipient.update({
                where: { id: recipientId },
                data: { status: client_1.MessageStatus.FAILED, failedAt: new Date(), failureReason: `PROCESSOR_V2: ${error.message}` },
            });
            await this.campaignsService.updateCampaignStats(campaignId, currentStatus, client_1.MessageStatus.FAILED);
            await this.campaignsService.log(campaignId, `Message failed for recipient ${contactId}: ${error.message}`, client_1.CampaignLogLevel.ERROR);
            throw error;
        }
    }
};
exports.CampaignProcessor = CampaignProcessor;
__decorate([
    (0, bull_1.Process)('start-campaign'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], CampaignProcessor.prototype, "handleStartCampaign", null);
__decorate([
    (0, bull_1.Process)('send-message'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], CampaignProcessor.prototype, "handleSendMessage", null);
exports.CampaignProcessor = CampaignProcessor = CampaignProcessor_1 = __decorate([
    (0, bull_1.Processor)('campaign-messages'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messaging_service_1.MessagingService,
        campaigns_service_1.CampaignsService])
], CampaignProcessor);
//# sourceMappingURL=campaign.processor.js.map