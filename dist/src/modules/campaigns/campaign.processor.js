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
const client_1 = require("@prisma/client");
let CampaignProcessor = CampaignProcessor_1 = class CampaignProcessor {
    prisma;
    messagingService;
    logger = new common_1.Logger(CampaignProcessor_1.name);
    constructor(prisma, messagingService) {
        this.prisma = prisma;
        this.messagingService = messagingService;
    }
    async handleSendMessage(job) {
        const { campaignId, recipientId, orgId, accountId, contactId } = job.data;
        this.logger.debug(`Processing campaign message for recipient ${recipientId}`);
        try {
            const campaign = await this.prisma.campaign.findUnique({
                where: { id: campaignId },
                select: { status: true, name: true },
            });
            if (!campaign || campaign.status !== client_1.CampaignStatus.RUNNING) {
                this.logger.warn(`Campaign ${campaignId} is no longer running. Skipping job.`);
                return;
            }
            const body = `Hello! This is a message from campaign ${campaign.name}`;
            await this.messagingService.sendTextMessage(orgId, accountId, contactId, body);
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
                include: { _count: { select: { recipients: true } } },
            });
            const totalRecipients = await this.prisma.campaignRecipient.count({ where: { campaignId } });
            if (updatedCampaign.sentCount + updatedCampaign.failedCount >= totalRecipients) {
                await this.prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: client_1.CampaignStatus.COMPLETED, completedAt: new Date() },
                });
                await this.logToCampaign(campaignId, 'Campaign completed successfully', client_1.CampaignLogLevel.INFO);
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
                            data: { status: client_1.MessageStatus.FAILED },
                        },
                    },
                },
            });
            await this.logToCampaign(campaignId, `Message failed for recipient ${recipientId}: ${error.message}`, client_1.CampaignLogLevel.ERROR);
            throw error;
        }
    }
    async logToCampaign(campaignId, message, level) {
        await this.prisma.campaignLog.create({
            data: {
                campaignId,
                message,
                level,
            },
        });
    }
};
exports.CampaignProcessor = CampaignProcessor;
__decorate([
    (0, bull_1.Process)('send-message'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], CampaignProcessor.prototype, "handleSendMessage", null);
exports.CampaignProcessor = CampaignProcessor = CampaignProcessor_1 = __decorate([
    (0, bull_1.Processor)('campaign-messages'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messaging_service_1.MessagingService])
], CampaignProcessor);
//# sourceMappingURL=campaign.processor.js.map