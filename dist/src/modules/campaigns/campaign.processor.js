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
                select: { status: true, name: true, totalRecipients: true, sentCount: true, failedCount: true },
            });
            if (!campaign || campaign.status === 'CANCELLED') {
                this.logger.warn(`Campaign ${campaignId} is CANCELLED. Skipping message for recipient ${recipientId}.`);
                return;
            }
            const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
            if (!contact)
                throw new Error('Contact not found');
            const bodyParameters = (templateParams || [])
                .sort((a, b) => a.index - b.index)
                .map((p) => ({
                type: 'text',
                text: p.field ? (contact[p.field] || '') : p.value
            }));
            const components = [{ type: 'body', parameters: bodyParameters }];
            await this.messagingService.sendTemplateMessage(orgId, accountId, contactId, templateName, 'en_US', components, { campaignId });
            const updatedCampaign = await this.prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    sentCount: { increment: 1 },
                    recipients: {
                        update: {
                            where: { id: recipientId },
                            data: { status: client_1.MessageStatus.SENT, sentAt: new Date() },
                        },
                    },
                },
            });
            if (updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients) {
                await this.prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: client_1.CampaignStatus.COMPLETED, completedAt: new Date() },
                });
                await this.campaignsService.log(campaignId, 'Broadcast completed successfully', client_1.CampaignLogLevel.INFO);
            }
        }
        catch (error) {
            this.logger.error(`Failed to process campaign message for recipient ${recipientId}: ${error.message}`);
            await this.prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    failedCount: { increment: 1 },
                    recipients: {
                        update: {
                            where: { id: recipientId },
                            data: { status: client_1.MessageStatus.FAILED, failedAt: new Date(), failureReason: error.message },
                        },
                    },
                },
            });
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