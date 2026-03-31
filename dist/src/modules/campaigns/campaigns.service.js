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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CampaignsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let CampaignsService = CampaignsService_1 = class CampaignsService {
    prisma;
    campaignQueue;
    logger = new common_1.Logger(CampaignsService_1.name);
    constructor(prisma, campaignQueue) {
        this.prisma = prisma;
        this.campaignQueue = campaignQueue;
    }
    async create(orgId, data) {
        const campaign = await this.prisma.campaign.create({
            data: { ...data, organizationId: orgId },
        });
        await this.log(campaign.id, 'Campaign created as DRAFT', client_1.CampaignLogLevel.INFO);
        return campaign;
    }
    async getCampaign(orgId, campaignId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
            include: {
                recipients: { take: 10 },
                logs: { orderBy: { createdAt: 'desc' }, take: 20 },
            },
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign;
    }
    async addRecipients(orgId, campaignId, contactIds) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        const data = contactIds.map((contactId) => ({
            campaignId,
            contactId,
        }));
        const result = await this.prisma.campaignRecipient.createMany({
            data,
            skipDuplicates: true,
        });
        await this.log(campaignId, `Added ${result.count} contacts to campaign. Total recipients now in queue.`, client_1.CampaignLogLevel.INFO);
        return result;
    }
    async log(campaignId, message, level = client_1.CampaignLogLevel.INFO, metadata = {}) {
        return this.prisma.campaignLog.create({
            data: {
                campaignId,
                message,
                level,
                metadata,
            },
        });
    }
    async startCampaign(orgId, campaignId, accountId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
            include: { recipients: true },
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        if (campaign.status === client_1.CampaignStatus.RUNNING) {
            throw new common_1.BadRequestException('Campaign is already running');
        }
        await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { status: client_1.CampaignStatus.RUNNING, startedAt: new Date() },
        });
        await this.log(campaignId, `Campaign started with ${campaign.recipients.length} recipients`, client_1.CampaignLogLevel.INFO);
        const jobs = campaign.recipients.map((recipient) => ({
            name: 'send-message',
            data: {
                campaignId: campaign.id,
                recipientId: recipient.id,
                orgId: campaign.organizationId,
                accountId,
                contactId: recipient.contactId,
                templateName: campaign.templateName,
                templateParams: campaign.templateParams,
            },
        }));
        await this.campaignQueue.addBulk(jobs);
        this.logger.log(`Enqueued ${jobs.length} messages for campaign ${campaign.name}`);
        return { success: true, message: `Enqueued ${jobs.length} messages` };
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = CampaignsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('campaign-messages')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_1.Queue])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map