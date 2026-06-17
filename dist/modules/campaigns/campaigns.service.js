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
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const messaging_service_1 = require("../messaging/messaging.service");
const client_1 = require("@prisma/client");
let CampaignsService = CampaignsService_1 = class CampaignsService {
    prisma;
    contactsService;
    realtimeGateway;
    messagingService;
    campaignQueue;
    logger = new common_1.Logger(CampaignsService_1.name);
    constructor(prisma, contactsService, realtimeGateway, messagingService, campaignQueue) {
        this.prisma = prisma;
        this.contactsService = contactsService;
        this.realtimeGateway = realtimeGateway;
        this.messagingService = messagingService;
        this.campaignQueue = campaignQueue;
    }
    async findAll(orgId, accountContext) {
        const campaigns = await this.prisma.campaign.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { recipients: true } }
            }
        });
        return campaigns.map(c => {
            const readCount = Math.max(0, c.readCount);
            const deliveredCount = Math.max(0, c.deliveredCount, readCount);
            const sentCount = Math.max(0, c.sentCount, deliveredCount);
            return {
                ...c,
                readCount,
                deliveredCount,
                sentCount
            };
        });
    }
    async createBroadcast(orgId, data) {
        let { name, accountId, templateName, templateParams, contactIds, targetTag, targetTags, numbers, tagName, autoSegment, scheduledAt, batches, targetType, targetName } = data;
        const account = await this.prisma.whatsAppAccount.findUnique({ where: { id: accountId, organizationId: orgId } });
        if (!account)
            throw new common_1.NotFoundException('Account not found');
        if (numbers && numbers.length > 0) {
            const broadcastSysTag = `_sys_broadcast_${Date.now()}`;
            const contactData = numbers.map(num => {
                const tagsToAssign = [broadcastSysTag];
                if (tagName)
                    tagsToAssign.push(tagName);
                return { phone: num, tags: tagsToAssign };
            });
            await this.contactsService.atomicBulkImport(orgId, contactData);
            targetTag = broadcastSysTag;
        }
        let finalContactIds = contactIds || [];
        if (targetTag || (targetTags && targetTags.length > 0)) {
            const queryTags = targetTags && targetTags.length > 0 ? targetTags : [targetTag];
            const rawResult = await this.prisma.$queryRaw `
         SELECT id FROM "contacts"
         WHERE "organizationId" = ${orgId} AND "tags" && ${queryTags}
       `;
            finalContactIds = rawResult.map(c => c.id);
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
            }
            else if (!data.saveAsDraft && !data.sendAnyways) {
                throw new common_1.BadRequestException(`Target audience (${finalContactIds.length}) exceeds your daily messaging limit (${account.messagingLimitCount}). Please select a smaller audience or enable Auto-Segmentation.`);
            }
        }
        if (batches && batches.length > 0) {
            let startIndex = 0;
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const batchContactIds = finalContactIds.slice(startIndex, startIndex + batch.size);
                startIndex += batch.size;
                if (batchContactIds.length === 0)
                    break;
                const batchScheduledDate = new Date(batch.scheduledAt);
                const isBatchScheduled = batchScheduledDate.getTime() > Date.now();
                let batchStatus = isBatchScheduled ? client_1.CampaignStatus.SCHEDULED : client_1.CampaignStatus.RUNNING;
                if (data.saveAsDraft)
                    batchStatus = client_1.CampaignStatus.DRAFT;
                const childCampaign = await this.prisma.campaign.create({
                    data: {
                        name: `${name} (Batch ${i + 1}/${batches.length})`,
                        organizationId: orgId,
                        templateName,
                        templateParams: templateParams || [],
                        status: batchStatus,
                        scheduledAt: batchScheduledDate,
                        totalRecipients: batchContactIds.length,
                        metadata: { accountId, targetTag, isBatchChild: true, batchIndex: i, targetType, targetName }
                    }
                });
                await this.campaignQueue.add('build-audience', {
                    campaignId: childCampaign.id,
                    orgId,
                    accountId,
                    finalContactIds: batchContactIds,
                    leftoverContactIds: [],
                    targetTag: undefined,
                    autoSegment: false,
                    isScheduled: isBatchScheduled,
                    scheduledAt: batchScheduledDate,
                    saveAsDraft: data.saveAsDraft
                });
            }
            return { success: true, message: `Broadcast split into ${batches.length} batches and initiated.` };
        }
        const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
        const isScheduled = scheduledDate && scheduledDate.getTime() > Date.now();
        let campaignStatus = isScheduled ? client_1.CampaignStatus.SCHEDULED : client_1.CampaignStatus.RUNNING;
        if (data.saveAsDraft) {
            campaignStatus = client_1.CampaignStatus.DRAFT;
        }
        const campaign = await this.prisma.campaign.create({
            data: {
                name,
                organizationId: orgId,
                templateName,
                templateParams: templateParams || [],
                status: campaignStatus,
                scheduledAt: scheduledDate,
                totalRecipients: finalContactIds.length,
                metadata: {
                    accountId,
                    hasAutoSegmented: leftoverContactIds.length > 0,
                    leftoverCount: leftoverContactIds.length,
                    targetTag,
                    messagingLimitCount: account.messagingLimitCount,
                    templateLanguage: data.templateLanguage || 'en_US',
                    targetType,
                    targetName
                }
            }
        });
        await this.campaignQueue.add('build-audience', {
            campaignId: campaign.id,
            orgId,
            accountId,
            finalContactIds,
            leftoverContactIds,
            targetTag,
            autoSegment,
            isScheduled,
            scheduledAt: scheduledDate,
            saveAsDraft: data.saveAsDraft
        });
        if (data.saveAsDraft) {
            return { success: true, message: 'Broadcast saved as draft (building audience)', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
        }
        else if (isScheduled) {
            return { success: true, message: 'Broadcast scheduled', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
        }
        else {
            return { success: true, message: 'Broadcast initiated', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
        }
    }
    async updateCampaign(orgId, campaignId, data) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId }
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        const updates = {};
        if (data.name)
            updates.name = data.name;
        if (data.scheduledAt)
            updates.scheduledAt = new Date(data.scheduledAt);
        const updatedCampaign = await this.prisma.campaign.update({
            where: { id: campaignId },
            data: updates
        });
        if (data.scheduledAt && campaign.status === 'SCHEDULED') {
            const jobId = `start-${campaignId}`;
            const existingJob = await this.campaignQueue.getJob(jobId);
            if (existingJob) {
                await existingJob.remove();
                this.logger.debug(`Removed old scheduled job ${jobId}`);
            }
            const newDelay = new Date(data.scheduledAt).getTime() - Date.now();
            const accountId = campaign.metadata?.accountId;
            if (accountId) {
                await this.campaignQueue.add('start-campaign', { campaignId, orgId, accountId }, { delay: newDelay > 0 ? newDelay : 0, jobId });
                this.logger.log(`Re-queued campaign ${campaignId} with delay ${newDelay}ms`);
            }
        }
        return { success: true, message: 'Campaign updated successfully', campaign: updatedCampaign };
    }
    async getUpdatedTagsForLeftovers(ids, oldTag, newTag) {
        return [];
    }
    async startCampaign(orgId, campaignId, accountId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        if (campaign.status === 'CANCELLED')
            return { success: false, message: 'Campaign was cancelled' };
        await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { status: client_1.CampaignStatus.RUNNING, startedAt: new Date() },
        });
        const chunkSize = 5000;
        let skip = 0;
        let totalQueued = 0;
        while (true) {
            const recipients = await this.prisma.campaignRecipient.findMany({
                where: { campaignId: campaign.id },
                skip,
                take: chunkSize,
                select: { id: true, contactId: true }
            });
            if (recipients.length === 0)
                break;
            const jobs = recipients.map((recipient) => ({
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
                opts: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000,
                    },
                },
            }));
            await this.campaignQueue.addBulk(jobs);
            totalQueued += jobs.length;
            skip += chunkSize;
        }
        return { success: true, message: `Enqueued ${totalQueued} messages`, campaignId };
    }
    async triggerCampaign(orgId, campaignId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId }
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        if (campaign.status !== 'DRAFT')
            throw new common_1.BadRequestException('Only draft campaigns can be triggered');
        const accountId = campaign.metadata?.accountId;
        if (!accountId)
            throw new common_1.BadRequestException('Campaign is missing account association');
        if (campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now()) {
            const delay = new Date(campaign.scheduledAt).getTime() - Date.now();
            await this.prisma.campaign.update({
                where: { id: campaign.id },
                data: { status: client_1.CampaignStatus.SCHEDULED },
            });
            await this.campaignQueue.add('start-campaign', { campaignId: campaign.id, orgId, accountId }, { delay, jobId: `start-${campaign.id}` });
            return { success: true, message: `Campaign scheduled for ${campaign.scheduledAt.toISOString()}` };
        }
        return this.startCampaign(orgId, campaign.id, accountId);
    }
    async sendInstantScheduledCampaign(orgId, campaignId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId }
        });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        if (campaign.status !== client_1.CampaignStatus.SCHEDULED)
            throw new common_1.BadRequestException('Only scheduled campaigns can be sent instantly');
        const accountId = campaign.metadata?.accountId;
        if (!accountId)
            throw new common_1.BadRequestException('Campaign is missing account association');
        const jobId = `start-${campaign.id}`;
        const job = await this.campaignQueue.getJob(jobId);
        if (job) {
            await job.remove();
        }
        await this.prisma.campaign.update({
            where: { id: campaign.id },
            data: { scheduledAt: new Date() }
        });
        return this.startCampaign(orgId, campaign.id, accountId);
    }
    async cancelCampaign(orgId, campaignId) {
        await this.prisma.campaign.update({
            where: { id: campaignId, organizationId: orgId },
            data: { status: 'CANCELLED' }
        });
        return { success: true, message: 'Campaign cancelled' };
    }
    async deleteCampaign(orgId, campaignId) {
        return this.prisma.$transaction([
            this.prisma.campaignRecipient.deleteMany({ where: { campaignId } }),
            this.prisma.campaignLog.deleteMany({ where: { campaignId } }),
            this.prisma.campaign.delete({ where: { id: campaignId, organizationId: orgId } })
        ]);
    }
    async getCampaign(orgId, campaignId) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId, organizationId: orgId },
            include: {
                recipients: { include: { contact: true }, take: 500 },
                logs: { orderBy: { createdAt: 'desc' }, take: 20 }
            }
        });
        if (campaign) {
            const readCount = Math.max(0, campaign.readCount);
            const deliveredCount = Math.max(0, campaign.deliveredCount, readCount);
            const sentCount = Math.max(0, campaign.sentCount, deliveredCount);
            return {
                ...campaign,
                readCount,
                deliveredCount,
                sentCount
            };
        }
        return null;
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
            'First Response': r.firstResponse || 'N/A',
            'Responded At': r.firstResponseAt?.toLocaleString() || 'N/A',
            'Error': r.failureReason || ''
        }));
    }
    async sendTestMessage(orgId, data) {
        const { accountId, phone, templateName, language = 'en_US', components = [] } = data;
        let contact = await this.prisma.contact.findFirst({
            where: { organizationId: orgId, phone: phone }
        });
        if (!contact) {
            contact = await this.prisma.contact.create({
                data: {
                    organizationId: orgId,
                    phone: phone,
                    firstName: 'Test',
                    lastName: 'Contact',
                }
            });
        }
        const metaComponents = [];
        const broadcastParams = components || [];
        const resolveParamValue = (param, fallbackFieldKey) => {
            let text = '';
            const fieldKey = param?.field || fallbackFieldKey;
            const hasStaticValue = param && (param.field === '__STATIC__' || (param.value !== undefined && param.value !== null && param.field === ''));
            if (hasStaticValue || param?.field === '__STATIC__') {
                text = param?.value || '';
            }
            else if (fieldKey) {
                if (fieldKey.startsWith('custom:')) {
                    const cfKey = fieldKey.replace('custom:', '');
                    text = contact.customFields?.[cfKey] || '';
                }
                else if (fieldKey.startsWith('var:')) {
                    text = 'TestVar';
                }
                else {
                    text = contact[fieldKey] || contact.customFields?.[fieldKey] || '';
                }
            }
            return text;
        };
        const headerParams = broadcastParams.filter(p => p.componentType === 'HEADER');
        if (headerParams.length > 0) {
            const headerParameters = [];
            headerParams.forEach(p => {
                const resolvedValue = resolveParamValue(p);
                if (p.mediaType && p.mediaType !== 'TEXT') {
                    const mediaValue = String(resolvedValue || '').trim();
                    if (!mediaValue)
                        return;
                    const isLink = mediaValue.startsWith('http://') || mediaValue.startsWith('https://');
                    const mediaObj = isLink ? { link: mediaValue } : { id: mediaValue };
                    if (p.mediaType === 'IMAGE')
                        headerParameters.push({ type: 'image', image: mediaObj });
                    else if (p.mediaType === 'VIDEO')
                        headerParameters.push({ type: 'video', video: mediaObj });
                    else if (p.mediaType === 'DOCUMENT')
                        headerParameters.push({ type: 'document', document: { ...mediaObj, filename: p.filename || 'Document.pdf' } });
                }
                else {
                    headerParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
                }
            });
            if (headerParameters.length > 0)
                metaComponents.push({ type: 'header', parameters: headerParameters });
        }
        const bodyParameters = [];
        const bodyParams = broadcastParams.filter(p => !p.componentType || p.componentType === 'BODY');
        if (bodyParams.length > 0) {
            bodyParams.sort((a, b) => parseInt(a.index) - parseInt(b.index)).forEach(p => {
                const resolvedValue = resolveParamValue(p);
                bodyParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
            });
            if (bodyParameters.length > 0)
                metaComponents.push({ type: 'body', parameters: bodyParameters });
        }
        const buttonParams = broadcastParams.filter(p => p.componentType === 'BUTTON');
        if (buttonParams.length > 0) {
            const buttonsMap = {};
            buttonParams.forEach(p => {
                const btnIdx = typeof p.buttonIndex === 'number' ? p.buttonIndex : parseInt(p.buttonIndex || '0');
                if (!buttonsMap[btnIdx])
                    buttonsMap[btnIdx] = [];
                buttonsMap[btnIdx].push(p);
            });
            Object.keys(buttonsMap).forEach(btnIdxStr => {
                const btnIdx = parseInt(btnIdxStr);
                const params = buttonsMap[btnIdx];
                const buttonParameters = params.sort((a, b) => parseInt(a.index) - parseInt(b.index)).map(p => {
                    const resolvedValue = resolveParamValue(p);
                    return { type: 'text', text: String(resolvedValue?.trim() || ' ') };
                });
                metaComponents.push({ type: 'button', sub_type: 'url', index: String(btnIdx), parameters: buttonParameters });
            });
        }
        return this.messagingService.sendTemplateMessage(orgId, accountId, contact.id, templateName, language, metaComponents, { isTestMessage: true });
    }
    async log(campaignId, message, level = client_1.CampaignLogLevel.INFO, metadata = {}) {
        return this.prisma.campaignLog.create({
            data: { campaignId, message, level, metadata },
        });
    }
    async updateCampaignStats(campaignId, oldStatus, newStatus) {
        if (oldStatus === newStatus)
            return;
        const incrementData = {};
        const decrementData = {};
        if (oldStatus === client_1.MessageStatus.SENT)
            decrementData.sentCount = 1;
        if (oldStatus === client_1.MessageStatus.DELIVERED)
            decrementData.deliveredCount = 1;
        if (oldStatus === client_1.MessageStatus.READ)
            decrementData.readCount = 1;
        if (oldStatus === client_1.MessageStatus.FAILED)
            decrementData.failedCount = 1;
        if (newStatus === client_1.MessageStatus.SENT)
            incrementData.sentCount = 1;
        if (newStatus === client_1.MessageStatus.DELIVERED)
            incrementData.deliveredCount = 1;
        if (newStatus === client_1.MessageStatus.READ)
            incrementData.readCount = 1;
        if (newStatus === client_1.MessageStatus.FAILED)
            incrementData.failedCount = 1;
        const updateData = {};
        const keys = ['sentCount', 'deliveredCount', 'readCount', 'failedCount'];
        for (const key of keys) {
            const inc = incrementData[key] || 0;
            const dec = decrementData[key] || 0;
            const diff = inc - dec;
            if (diff !== 0) {
                updateData[key] = { increment: diff };
            }
        }
        if (Object.keys(updateData).length > 0) {
            const updatedCampaign = await this.prisma.campaign.update({
                where: { id: campaignId },
                data: updateData
            });
            this.realtimeGateway.emitCampaignUpdate(updatedCampaign.organizationId, updatedCampaign);
            return updatedCampaign;
        }
        return this.prisma.campaign.findUnique({ where: { id: campaignId } });
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = CampaignsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, bull_1.InjectQueue)('campaign-messages')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        contacts_service_1.ContactsService,
        realtime_gateway_1.RealtimeGateway,
        messaging_service_1.MessagingService,
        bullmq_1.Queue])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map