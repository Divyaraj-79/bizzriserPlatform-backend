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
    campaignQueue;
    logger = new common_1.Logger(CampaignProcessor_1.name);
    templateCache = new Map();
    constructor(prisma, messagingService, campaignsService, campaignQueue) {
        this.prisma = prisma;
        this.messagingService = messagingService;
        this.campaignsService = campaignsService;
        this.campaignQueue = campaignQueue;
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
    async handleBuildAudience(job) {
        const { campaignId, orgId, accountId, finalContactIds, leftoverContactIds, targetTag, autoSegment, isScheduled, scheduledAt, saveAsDraft } = job.data;
        this.logger.log(`Building audience for campaign ${campaignId}. Target contacts: ${finalContactIds.length}`);
        try {
            if (autoSegment && leftoverContactIds && leftoverContactIds.length > 0) {
                if (targetTag) {
                    const leftoverTag = `leftover_${targetTag}`;
                    await this.prisma.contact.updateMany({
                        where: { id: { in: leftoverContactIds } },
                        data: {
                            tags: [leftoverTag]
                        }
                    });
                    this.logger.debug(`Retagged ${leftoverContactIds.length} leftovers with ${leftoverTag}`);
                }
            }
            const recipientData = finalContactIds.map((id) => ({
                campaignId,
                contactId: id,
                status: client_1.MessageStatus.PENDING
            }));
            const chunkSize = 5000;
            for (let i = 0; i < recipientData.length; i += chunkSize) {
                const chunk = recipientData.slice(i, i + chunkSize);
                await this.prisma.campaignRecipient.createMany({
                    data: chunk,
                    skipDuplicates: true
                });
            }
            const segmentedMsg = leftoverContactIds?.length > 0 ? ` ${leftoverContactIds.length} contacts segmented.` : '';
            await this.campaignsService.log(campaignId, `Broadcast audience built with ${finalContactIds.length} recipients.${segmentedMsg}`, client_1.CampaignLogLevel.INFO);
            if (!saveAsDraft && !isScheduled) {
                await this.campaignsService.startCampaign(orgId, campaignId, accountId);
            }
            else if (!saveAsDraft && isScheduled && scheduledAt) {
                const delay = new Date(scheduledAt).getTime() - Date.now();
                await this.campaignQueue.add('start-campaign', { campaignId, orgId, accountId }, {
                    delay: delay > 0 ? delay : 0,
                    jobId: `start-${campaignId}`
                });
                this.logger.log(`Queued scheduled campaign ${campaignId} with delay ${delay}ms`);
            }
        }
        catch (err) {
            this.logger.error(`Audience building failed for campaign ${campaignId}: ${err.message}`);
            await this.campaignsService.log(campaignId, `Audience building failed: ${err.message}`, client_1.CampaignLogLevel.ERROR);
        }
    }
    async handleSendMessage(job) {
        const { campaignId, recipientId, orgId, accountId, contactId, templateName, templateParams } = job.data;
        this.logger.debug(`Processing campaign message for recipient ${recipientId}`);
        try {
            const campaign = await this.prisma.campaign.findUnique({
                where: { id: campaignId },
                select: { status: true, metadata: true },
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
            const phoneDigits = contact.phone.replace(/\D/g, '');
            if (phoneDigits.length < 4 || phoneDigits.length > 15) {
                this.logger.warn(`Campaign ${campaignId} skipping recipient ${recipientId} due to invalid phone length: ${contact.phone}`);
                await this.prisma.campaignRecipient.update({
                    where: { id: recipientId },
                    data: { status: client_1.MessageStatus.FAILED, failureReason: `Invalid phone length (${phoneDigits.length} digits)` }
                });
                await this.campaignsService.updateCampaignStats(campaignId, oldStatus, client_1.MessageStatus.FAILED);
                return;
            }
            const templateLanguage = campaign.metadata?.templateLanguage;
            const cacheKey = `${accountId}_${templateName}_${templateLanguage || 'default'}`;
            let mappingRecord = this.templateCache.get(cacheKey);
            if (!mappingRecord) {
                mappingRecord = await this.prisma.whatsAppTemplate.findFirst({
                    where: {
                        accountId,
                        name: templateName,
                        language: templateLanguage || undefined
                    }
                });
                if (mappingRecord) {
                    this.templateCache.set(cacheKey, mappingRecord);
                }
            }
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
                        const varKey = fieldKey.replace('var:', '');
                        text = templateParams?.[varKey] || templateParams?.find?.((p) => p.name === varKey)?.value || '';
                    }
                    else {
                        text = contact[fieldKey] || contact.customFields?.[fieldKey] || '';
                    }
                }
                return text;
            };
            const components = [];
            const broadcastParams = templateParams || [];
            const headerParams = broadcastParams.filter(p => p.componentType === 'HEADER');
            if (headerParams.length > 0) {
                const headerParameters = [];
                headerParams.forEach(p => {
                    const resolvedValue = resolveParamValue(p);
                    if (p.mediaType && p.mediaType !== 'TEXT') {
                        const mediaValue = String(resolvedValue || '').trim();
                        if (!mediaValue) {
                            this.logger.warn(`[Campaign ${campaignId}] Skipping empty media header for recipient ${recipientId}. Template: ${templateName}, mediaType: ${p.mediaType}`);
                            return;
                        }
                        const isLink = mediaValue.startsWith('http://') || mediaValue.startsWith('https://');
                        if (isLink && mediaValue.length < 12) {
                            this.logger.error(`[Campaign ${campaignId}] BLOCKED: media URL "${mediaValue}" is not a complete URL (too short). This would cause Meta error 131053. Skipping. Template: ${templateName}`);
                            return;
                        }
                        const mediaObj = isLink ? { link: mediaValue } : { id: mediaValue };
                        if (p.mediaType === 'IMAGE') {
                            headerParameters.push({ type: 'image', image: mediaObj });
                        }
                        else if (p.mediaType === 'VIDEO') {
                            headerParameters.push({ type: 'video', video: mediaObj });
                        }
                        else if (p.mediaType === 'DOCUMENT') {
                            headerParameters.push({
                                type: 'document',
                                document: {
                                    ...mediaObj,
                                    filename: p.filename || 'Document.pdf'
                                }
                            });
                        }
                    }
                    else {
                        headerParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
                    }
                });
                if (headerParameters.length > 0) {
                    components.push({ type: 'header', parameters: headerParameters });
                }
            }
            const bodyParameters = [];
            const bodyParams = broadcastParams.filter(p => !p.componentType || p.componentType === 'BODY');
            if (bodyParams.length > 0) {
                bodyParams
                    .sort((a, b) => parseInt(a.index) - parseInt(b.index))
                    .forEach(p => {
                    const resolvedValue = resolveParamValue(p);
                    bodyParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
                });
            }
            else {
                const variableMapping = mappingRecord?.variableMapping || {};
                if (Object.keys(variableMapping).length > 0) {
                    Object.keys(variableMapping)
                        .sort((a, b) => parseInt(a) - parseInt(b))
                        .forEach(index => {
                        const fallbackField = variableMapping[index];
                        const resolvedValue = resolveParamValue(null, fallbackField);
                        bodyParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
                    });
                }
            }
            if (bodyParameters.length > 0) {
                components.push({ type: 'body', parameters: bodyParameters });
            }
            const buttonParams = broadcastParams.filter(p => p.componentType === 'BUTTON');
            if (buttonParams.length > 0) {
                const buttonsMap = {};
                buttonParams.forEach(p => {
                    const btnIdx = typeof p.buttonIndex === 'number' ? p.buttonIndex : parseInt(p.buttonIndex || '0');
                    if (!buttonsMap[btnIdx]) {
                        buttonsMap[btnIdx] = [];
                    }
                    buttonsMap[btnIdx].push(p);
                });
                Object.keys(buttonsMap).forEach(btnIdxStr => {
                    const btnIdx = parseInt(btnIdxStr);
                    const params = buttonsMap[btnIdx];
                    const buttonParameters = params
                        .sort((a, b) => parseInt(a.index) - parseInt(b.index))
                        .map(p => {
                        const resolvedValue = resolveParamValue(p);
                        return { type: 'text', text: String(resolvedValue?.trim() || ' ') };
                    });
                    components.push({
                        type: 'button',
                        sub_type: 'url',
                        index: String(btnIdx),
                        parameters: buttonParameters
                    });
                });
            }
            const finalLanguage = templateLanguage || mappingRecord?.language || 'en_US';
            const chatbotId = campaign.metadata?.chatbotId;
            await this.messagingService.sendTemplateMessage(orgId, accountId, contactId, templateName, finalLanguage, components, {
                campaignId,
                ...(chatbotId && { chatbotId })
            });
            const currentRecipient = await this.prisma.campaignRecipient.findUnique({
                where: { id: recipientId },
                select: { status: true }
            });
            const oldRecipientStatus = currentRecipient?.status || client_1.MessageStatus.PENDING;
            const statusOrder = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
            const currentOrder = statusOrder[oldRecipientStatus] || 0;
            const newOrder = statusOrder[client_1.MessageStatus.SENT] || 0;
            const recipientUpdate = { sentAt: new Date() };
            let finalStatus = oldRecipientStatus;
            if (newOrder > currentOrder) {
                recipientUpdate.status = client_1.MessageStatus.SENT;
                finalStatus = client_1.MessageStatus.SENT;
            }
            await this.prisma.campaignRecipient.update({
                where: { id: recipientId },
                data: recipientUpdate,
            });
            const updatedCampaign = await this.campaignsService.updateCampaignStats(campaignId, oldRecipientStatus, finalStatus);
            if (updatedCampaign && updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients && updatedCampaign.status !== client_1.CampaignStatus.COMPLETED) {
                await this.prisma.campaign.updateMany({
                    where: { id: campaignId, status: { not: client_1.CampaignStatus.COMPLETED } },
                    data: { status: client_1.CampaignStatus.COMPLETED, completedAt: new Date() },
                });
                await this.campaignsService.log(campaignId, 'Broadcast completed successfully', client_1.CampaignLogLevel.INFO);
            }
        }
        catch (error) {
            const maxAttempts = job.opts.attempts || 1;
            const isLastAttempt = job.attemptsMade >= maxAttempts - 1;
            this.logger.error(`Failed to process campaign message for recipient ${recipientId} (Attempt ${job.attemptsMade + 1}/${maxAttempts}): ${error.message}`);
            if (isLastAttempt) {
                const currentRecipient = await this.prisma.campaignRecipient.findUnique({ where: { id: recipientId } });
                const currentStatus = currentRecipient?.status || client_1.MessageStatus.PENDING;
                if (currentStatus !== client_1.MessageStatus.FAILED) {
                    await this.prisma.campaignRecipient.update({
                        where: { id: recipientId },
                        data: { status: client_1.MessageStatus.FAILED, failedAt: new Date(), failureReason: `PROCESSOR_V2: ${error.message}` },
                    });
                    const updatedCampaign = await this.campaignsService.updateCampaignStats(campaignId, currentStatus, client_1.MessageStatus.FAILED);
                    if (updatedCampaign && updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients && updatedCampaign.status !== client_1.CampaignStatus.COMPLETED) {
                        await this.prisma.campaign.updateMany({
                            where: { id: campaignId, status: { not: client_1.CampaignStatus.COMPLETED } },
                            data: { status: client_1.CampaignStatus.COMPLETED, completedAt: new Date() },
                        });
                        await this.campaignsService.log(campaignId, 'Broadcast completed successfully', client_1.CampaignLogLevel.INFO);
                    }
                }
                await this.campaignsService.log(campaignId, `Message permanently failed for recipient ${contactId} after ${maxAttempts} attempts: ${error.message}`, client_1.CampaignLogLevel.ERROR);
            }
            else {
                this.logger.warn(`Job will be retried (Attempt ${job.attemptsMade + 1}/${maxAttempts})...`);
            }
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
    (0, bull_1.Process)('build-audience'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], CampaignProcessor.prototype, "handleBuildAudience", null);
__decorate([
    (0, bull_1.Process)({ name: 'send-message', concurrency: 50 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], CampaignProcessor.prototype, "handleSendMessage", null);
exports.CampaignProcessor = CampaignProcessor = CampaignProcessor_1 = __decorate([
    (0, bull_1.Processor)('campaign-messages'),
    __param(3, (0, bull_1.InjectQueue)('campaign-messages')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messaging_service_1.MessagingService,
        campaigns_service_1.CampaignsService, Object])
], CampaignProcessor);
//# sourceMappingURL=campaign.processor.js.map