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
const contacts_service_1 = require("../contacts/contacts.service");
const client_1 = require("@prisma/client");
let CampaignsService = CampaignsService_1 = class CampaignsService {
    prisma;
    contactsService;
    campaignQueue;
    logger = new common_1.Logger(CampaignsService_1.name);
    constructor(prisma, contactsService, campaignQueue) {
        this.prisma = prisma;
        this.contactsService = contactsService;
        this.campaignQueue = campaignQueue;
    }
    async findAll(orgId, accountContext) {
        const where = { organizationId: orgId };
        if (accountContext) {
            if (Array.isArray(accountContext)) {
                where.whatsappAccountId = { in: accountContext };
            }
            else {
                where.whatsappAccountId = accountContext;
            }
        }
        return this.prisma.campaign.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { recipients: true } }
            }
        });
    }
    async createBroadcast(orgId, data) {
        let { name, accountId, templateName, templateParams, contactIds, targetTag, numbers, tagName, autoSegment, scheduledAt } = data;
        const account = await this.prisma.whatsAppAccount.findUnique({ where: { id: accountId, organizationId: orgId } });
        if (!account)
            throw new common_1.NotFoundException('Account not found');
        if (numbers && numbers.length > 0) {
            const effectiveTagName = tagName || `pasted_${Date.now()}`;
            const contactData = numbers.map(num => ({ phone: num, tags: [effectiveTagName] }));
            await this.contactsService.atomicBulkImport(orgId, contactData);
            targetTag = effectiveTagName;
        }
        let finalContactIds = contactIds || [];
        if (targetTag) {
            const taggedContacts = await this.prisma.contact.findMany({
                where: { organizationId: orgId, tags: { has: targetTag } },
                select: { id: true }
            });
            finalContactIds = taggedContacts.map(c => c.id);
        }
        if (finalContactIds.length === 0) {
            throw new common_1.BadRequestException('No contacts targeted for this broadcast.');
        }
        let leftoverContactIds = [];
        const limitCount = account.messagingLimitCount || 1000;
        if (finalContactIds.length > limitCount) {
            if (autoSegment) {
                leftoverContactIds = finalContactIds.slice(limitCount);
                finalContactIds = finalContactIds.slice(0, limitCount);
                if (targetTag) {
                    const leftoverTag = `leftover_${targetTag}`;
                    await this.prisma.contact.updateMany({
                        where: { id: { in: leftoverContactIds } },
                        data: {
                            tags: {
                                set: await this.getUpdatedTagsForLeftovers(leftoverContactIds, targetTag, leftoverTag)
                            }
                        }
                    });
                }
            }
            else {
                throw new common_1.BadRequestException(`Target audience (${finalContactIds.length}) exceeds your daily messaging limit (${account.messagingLimitCount}). Please select a smaller audience or enable Auto-Segmentation.`);
            }
        }
        const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
        const isScheduled = scheduledDate && scheduledDate.getTime() > Date.now();
        const campaign = await this.prisma.campaign.create({
            data: {
                name,
                organizationId: orgId,
                templateName,
                templateParams: templateParams || [],
                status: isScheduled ? client_1.CampaignStatus.SCHEDULED : client_1.CampaignStatus.RUNNING,
                scheduledAt: scheduledDate,
                totalRecipients: finalContactIds.length,
                metadata: {
                    accountId,
                    hasAutoSegmented: leftoverContactIds.length > 0,
                    leftoverCount: leftoverContactIds.length,
                    targetTag,
                    messagingLimitCount: account.messagingLimitCount,
                    templateLanguage: data.templateLanguage || 'en_US'
                }
            }
        });
        const recipientData = finalContactIds.map(id => ({
            campaignId: campaign.id,
            contactId: id,
            status: client_1.MessageStatus.PENDING
        }));
        await this.prisma.campaignRecipient.createMany({
            data: recipientData,
            skipDuplicates: true
        });
        await this.log(campaign.id, `Broadcast initiated with ${finalContactIds.length} recipients. ${leftoverContactIds.length > 0 ? leftoverContactIds.length + ' contacts segments for later.' : ''}`, client_1.CampaignLogLevel.INFO);
        if (isScheduled) {
            const delay = scheduledDate.getTime() - Date.now();
            await this.campaignQueue.add('start-campaign', {
                campaignId: campaign.id,
                orgId,
                accountId
            }, { delay });
            return { success: true, message: 'Broadcast scheduled', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
        }
        else {
            return this.startCampaign(orgId, campaign.id, accountId);
        }
    }
    async getUpdatedTagsForLeftovers(ids, oldTag, newTag) {
        return [];
    }
    async startCampaign(orgId, campaignId, accountId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
            include: { recipients: true },
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        if (campaign.status === 'CANCELLED')
            return { success: false, message: 'Campaign was cancelled' };
        await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { status: client_1.CampaignStatus.RUNNING, startedAt: new Date() },
        });
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
        return { success: true, message: `Enqueued ${jobs.length} messages`, campaignId };
    }
    async cancelCampaign(orgId, campaignId) {
        await this.prisma.campaign.update({
            where: { id: campaignId, organizationId: orgId },
            data: { status: 'CANCELLED' }
        });
        return { success: true, message: 'Campaign cancelled' };
    }
    async deleteCampaign(orgId, campaignId) {
        return this.prisma.campaign.delete({ where: { id: campaignId, organizationId: orgId } });
    }
    async getCampaign(orgId, campaignId) {
        return this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
            include: {
                recipients: { include: { contact: true }, take: 500 },
                logs: { orderBy: { createdAt: 'desc' }, take: 20 }
            }
        });
    }
    async getExportData(orgId, campaignId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
            include: { recipients: { include: { contact: true } } }
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign.recipients.map(r => ({
            'Contact': `${r.contact.firstName} ${r.contact.lastName}`,
            'Phone': r.contact.phone,
            'Status': r.status,
            'Sent At': r.sentAt?.toLocaleString() || 'N/A',
            'Delivered At': r.deliveredAt?.toLocaleString() || 'N/A',
            'Read At': r.readAt?.toLocaleString() || 'N/A',
            'Failed At': r.failedAt?.toLocaleString() || 'N/A',
            'Error': r.failureReason || ''
        }));
    }
    async log(campaignId, message, level = client_1.CampaignLogLevel.INFO, metadata = {}) {
        return this.prisma.campaignLog.create({
            data: { campaignId, message, level, metadata },
        });
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = CampaignsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)('campaign-messages')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        contacts_service_1.ContactsService,
        bullmq_1.Queue])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map