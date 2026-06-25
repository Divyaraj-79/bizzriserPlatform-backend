import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MessagingService } from '../messaging/messaging.service';
import { CampaignStatus, CampaignLogLevel, MessageStatus } from '@prisma/client';


@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly messagingService: MessagingService,
    @InjectQueue('campaign-messages') private readonly campaignQueue: Queue,
  ) {}


  async findAll(orgId: string, accountContext?: string | string[]) {
    // Note: accountId is stored inside metadata JSON, not as a top-level column on Campaign.
    // We return all campaigns for the org; filtering by account would require JSON path queries.
    // OPTIMIZED: Removed `_count: { recipients: true }` subquery — totalRecipients is already
    // stored as a denormalized column on Campaign, so no JOIN is needed.
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
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

  async createBroadcast(orgId: string, data: { 
    name: string, 
    accountId: string, 
    templateName: string, 
    templateParams: any, 
    contactIds?: string[], 
    targetTag?: string,
    targetTags?: string[],
    numbers?: string[],
    tagName?: string,
    autoSegment?: boolean,
    sendAnyways?: boolean,
    scheduledAt?: string,
    saveAsDraft?: boolean,
    batches?: { size: number, scheduledAt: string }[],
    targetType?: string,
    targetName?: any
  }) {
    let { name, accountId, templateName, templateParams, contactIds, targetTag, targetTags, numbers, tagName, autoSegment, scheduledAt, batches, targetType, targetName } = data;


    const account = await this.prisma.whatsAppAccount.findUnique({ where: { id: accountId, organizationId: orgId } });
    if (!account) throw new NotFoundException('Account not found');

    // Handle Pasted Numbers mode
    if (numbers && numbers.length > 0) {
       // Generate a unique system tag strictly for targeting THIS broadcast
       const broadcastSysTag = `_sys_broadcast_${Date.now()}`;
       
       const contactData = numbers.map(num => {
          const tagsToAssign = [broadcastSysTag];
          if (tagName) tagsToAssign.push(tagName);
          return { phone: num, tags: tagsToAssign };
       });
       
       // Bulk upsert contacts with the specified tags
       await this.contactsService.atomicBulkImport(orgId, contactData);
       
       // Switch to tag-based targeting ONLY for this unique system tag
       targetTag = broadcastSysTag;
    }

    let finalContactIds: string[] = contactIds || [];


    // 1. Tag-based targeting
    if (targetTag || (targetTags && targetTags.length > 0)) {
       const queryTags = targetTags && targetTags.length > 0 ? targetTags : [targetTag!];
       const rawResult: { id: string }[] = await this.prisma.$queryRaw`
         SELECT id FROM "contacts"
         WHERE "organizationId" = ${orgId} AND "tags" && ${queryTags}
       `;
       finalContactIds = rawResult.map(c => c.id);
    }

    if (finalContactIds.length === 0) {
       throw new BadRequestException('No contacts targeted for this broadcast.');
    }

    // 2. Messaging Limit Logic
    let leftoverContactIds: string[] = [];
    const limitCount = (account as any).messagingLimitCount || 1000;
    
    if (finalContactIds.length > limitCount) {
       if (autoSegment) {
          leftoverContactIds = finalContactIds.slice(limitCount);
          finalContactIds = finalContactIds.slice(0, limitCount);
       } else if (!data.saveAsDraft && !data.sendAnyways) {
          throw new BadRequestException(`Target audience (${finalContactIds.length}) exceeds your daily messaging limit (${(account as any).messagingLimitCount}). Please select a smaller audience or enable Auto-Segmentation.`);
       }
    }

    // 3. Batch Splitting Logic
    if (batches && batches.length > 0) {
       let startIndex = 0;
       for (let i = 0; i < batches.length; i++) {
           const batch = batches[i];
           const batchContactIds = finalContactIds.slice(startIndex, startIndex + batch.size);
           startIndex += batch.size;
           
           if (batchContactIds.length === 0) break;

           const batchScheduledDate = new Date(batch.scheduledAt);
           const isBatchScheduled = batchScheduledDate.getTime() > Date.now();
           let batchStatus: CampaignStatus = isBatchScheduled ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING;
           if (data.saveAsDraft) batchStatus = CampaignStatus.DRAFT;

           const childCampaign = await this.prisma.campaign.create({
             data: {
               name: `${name} (Batch ${i+1}/${batches.length})`,
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
              leftoverContactIds: [], // handled by limit logic at parent level
              targetTag: undefined, // pass empty so processor relies on finalContactIds
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

    // 4. Single Campaign Creation
    let campaignStatus: CampaignStatus = isScheduled ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING;
    if (data.saveAsDraft) {
      campaignStatus = CampaignStatus.DRAFT;
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
           messagingLimitCount: (account as any).messagingLimitCount,
           templateLanguage: (data as any).templateLanguage || 'en_US',
           targetType,
           targetName
        }
      }
    });

    // 5. Delegate heavy array mapping, retagging and inserts to the Bull Queue
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

    // 6. Instant Response
    if (data.saveAsDraft) {
       return { success: true, message: 'Broadcast saved as draft (building audience)', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
    } else if (isScheduled) {
       return { success: true, message: 'Broadcast scheduled', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
    } else {
       return { success: true, message: 'Broadcast initiated', campaignId: campaign.id, segmentedCount: leftoverContactIds.length };
    }
  }

  async updateCampaign(orgId: string, campaignId: string, data: { name?: string, scheduledAt?: string }) {
     const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId, organizationId: orgId }
     });
     if (!campaign) throw new NotFoundException('Campaign not found');

     const updates: any = {};
     if (data.name) updates.name = data.name;
     if (data.scheduledAt) updates.scheduledAt = new Date(data.scheduledAt);

     const updatedCampaign = await this.prisma.campaign.update({
        where: { id: campaignId },
        data: updates
     });

     // Reschedule BullMQ Job
     if (data.scheduledAt && campaign.status === 'SCHEDULED') {
        const jobId = `start-${campaignId}`;
        const existingJob = await this.campaignQueue.getJob(jobId);
        if (existingJob) {
           await existingJob.remove();
           this.logger.debug(`Removed old scheduled job ${jobId}`);
        }
        
        const newDelay = new Date(data.scheduledAt).getTime() - Date.now();
        const accountId = (campaign.metadata as any)?.accountId;
        if (accountId) {
           await this.campaignQueue.add('start-campaign', { campaignId, orgId, accountId }, { delay: newDelay > 0 ? newDelay : 0, jobId });
           this.logger.log(`Re-queued campaign ${campaignId} with delay ${newDelay}ms`);
        }
     }

     return { success: true, message: 'Campaign updated successfully', campaign: updatedCampaign };
  }

  // Robust tag management for auto-segmentation
  private async getUpdatedTagsForLeftovers(ids: string[], oldTag: string, newTag: string) {
     // This is a helper for complex array updates if we needed them, 
     // but for now we'll implement it simpler in the service.
     // In a real prod env, we'd use raw SQL or a dedicated tagging module.
     return [];
  }

  async startCampaign(orgId: string, campaignId: string, accountId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === ('CANCELLED' as any)) return { success: false, message: 'Campaign was cancelled' };

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.RUNNING, startedAt: new Date() },
    });

    // Chunking to support 1 Lakh+ contacts without crashing RAM/Redis
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

      if (recipients.length === 0) break;

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

  async triggerCampaign(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId }
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== ('DRAFT' as any)) throw new BadRequestException('Only draft campaigns can be triggered');

    const accountId = (campaign.metadata as any)?.accountId;
    if (!accountId) throw new BadRequestException('Campaign is missing account association');

    if (campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now()) {
        const delay = new Date(campaign.scheduledAt).getTime() - Date.now();
        await this.prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.SCHEDULED },
        });
        await this.campaignQueue.add('start-campaign', { campaignId: campaign.id, orgId, accountId }, { delay, jobId: `start-${campaign.id}` });
        return { success: true, message: `Campaign scheduled for ${campaign.scheduledAt.toISOString()}` };
    }

    return this.startCampaign(orgId, campaign.id, accountId);
  }

  async sendInstantScheduledCampaign(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId }
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== CampaignStatus.SCHEDULED) throw new BadRequestException('Only scheduled campaigns can be sent instantly');

    const accountId = (campaign.metadata as any)?.accountId;
    if (!accountId) throw new BadRequestException('Campaign is missing account association');

    // Remove the delayed job from BullMQ
    const jobId = `start-${campaign.id}`;
    const job = await this.campaignQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }

    // Update scheduledAt to now
    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { scheduledAt: new Date() }
    });

    return this.startCampaign(orgId, campaign.id, accountId);
  }

  async cancelCampaign(orgId: string, campaignId: string) {
    await this.prisma.campaign.update({
      where: { id: campaignId, organizationId: orgId },
      data: { status: 'CANCELLED' as any }
    });
    return { success: true, message: 'Campaign cancelled' };
  }

  async deleteCampaign(orgId: string, campaignId: string) {
    return this.prisma.$transaction([
      this.prisma.campaignRecipient.deleteMany({ where: { campaignId } }),
      this.prisma.campaignLog.deleteMany({ where: { campaignId } }),
      this.prisma.campaign.delete({ where: { id: campaignId, organizationId: orgId } })
    ]);
  }

  async getCampaign(orgId: string, campaignId: string) {
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

  async getExportData(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
      include: { recipients: { include: { contact: true } } }
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    return campaign.recipients.map(r => ({
      'Contact': `${r.contact.firstName} ${r.contact.lastName}`,
      'Phone': r.contact.phone,
      'Status': r.status,
      'Sent At': r.sentAt?.toLocaleString() || 'N/A',
      'Delivered At': (r as any).deliveredAt?.toLocaleString() || 'N/A',
      'Read At': (r as any).readAt?.toLocaleString() || 'N/A',
      'Failed At': (r as any).failedAt?.toLocaleString() || 'N/A',
      'First Response': (r as any).firstResponse || 'N/A',
      'Responded At': (r as any).firstResponseAt?.toLocaleString() || 'N/A',
      'Error': (r as any).failureReason || ''
    }));
  }

  async sendTestMessage(orgId: string, data: { accountId: string; phone: string; templateName: string; language?: string; components?: any[] }) {
    const { accountId, phone, templateName, language = 'en_US', components = [] } = data;

    // To make sure it appears in the inbox, we need the contact to exist.
    
    // Fetch the newly created/existing contact to get its ID.
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

    // Transform paramMapping to Meta API components
    const metaComponents: any[] = [];
    const broadcastParams = components || [];

    const resolveParamValue = (param: any, fallbackFieldKey?: string) => {
      let text = '';
      const fieldKey = param?.field || fallbackFieldKey;
      const hasStaticValue = param && (param.field === '__STATIC__' || (param.value !== undefined && param.value !== null && param.field === ''));
      
      if (hasStaticValue || param?.field === '__STATIC__') {
        text = param?.value || '';
      } else if (fieldKey) {
        if (fieldKey.startsWith('custom:')) {
          const cfKey = fieldKey.replace('custom:', '');
          text = (contact.customFields as any)?.[cfKey] || '';
        } else if (fieldKey.startsWith('var:')) {
           text = 'TestVar';
        } else {
          text = (contact as any)[fieldKey] || (contact.customFields as any)?.[fieldKey] || '';
        }
      }
      return text;
    };

    // 1. Build HEADER parameters
    const headerParams = broadcastParams.filter(p => p.componentType === 'HEADER');
    if (headerParams.length > 0) {
      const headerParameters: any[] = [];
      headerParams.forEach(p => {
        const resolvedValue = resolveParamValue(p);
        if (p.mediaType && p.mediaType !== 'TEXT') {
          const mediaValue = String(resolvedValue || '').trim();
          if (!mediaValue) return;
          const isLink = mediaValue.startsWith('http://') || mediaValue.startsWith('https://');
          const mediaObj = isLink ? { link: mediaValue } : { id: mediaValue };
          if (p.mediaType === 'IMAGE') headerParameters.push({ type: 'image', image: mediaObj });
          else if (p.mediaType === 'VIDEO') headerParameters.push({ type: 'video', video: mediaObj });
          else if (p.mediaType === 'DOCUMENT') headerParameters.push({ type: 'document', document: { ...mediaObj, filename: p.filename || 'Document.pdf' } });
        } else {
          headerParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
        }
      });
      if (headerParameters.length > 0) metaComponents.push({ type: 'header', parameters: headerParameters });
    }

    // 2. Build BODY parameters
    const bodyParameters: any[] = [];
    const bodyParams = broadcastParams.filter(p => !p.componentType || p.componentType === 'BODY');
    if (bodyParams.length > 0) {
      bodyParams.sort((a, b) => parseInt(a.index) - parseInt(b.index)).forEach(p => {
        const resolvedValue = resolveParamValue(p);
        bodyParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
      });
      if (bodyParameters.length > 0) metaComponents.push({ type: 'body', parameters: bodyParameters });
    }

    // 3. Build BUTTON parameters
    const buttonParams = broadcastParams.filter(p => p.componentType === 'BUTTON');
    if (buttonParams.length > 0) {
      const buttonsMap: Record<number, any[]> = {};
      buttonParams.forEach(p => {
        const btnIdx = typeof p.buttonIndex === 'number' ? p.buttonIndex : parseInt(p.buttonIndex || '0');
        if (!buttonsMap[btnIdx]) buttonsMap[btnIdx] = [];
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

    // Now send the template message via messagingService so it logs to DB and Inbox
    return this.messagingService.sendTemplateMessage(
      orgId,
      accountId,
      contact.id,
      templateName,
      language,
      metaComponents,
      { isTestMessage: true }
    );
  }

  async log(campaignId: string, message: string, level: CampaignLogLevel = CampaignLogLevel.INFO, metadata: any = {}) {
    return this.prisma.campaignLog.create({
      data: { campaignId, message, level, metadata },
    });
  }

  async updateCampaignStats(campaignId: string, oldStatus: MessageStatus, newStatus: MessageStatus) {
    if (oldStatus === newStatus) return;

    const incrementData: any = {};
    const decrementData: any = {};

    // Decrement old status count
    if (oldStatus === MessageStatus.SENT) decrementData.sentCount = 1;
    if (oldStatus === MessageStatus.DELIVERED) decrementData.deliveredCount = 1;
    if (oldStatus === MessageStatus.READ) decrementData.readCount = 1;
    if (oldStatus === MessageStatus.FAILED) decrementData.failedCount = 1;

    // Increment new status count
    if (newStatus === MessageStatus.SENT) incrementData.sentCount = 1;
    if (newStatus === MessageStatus.DELIVERED) incrementData.deliveredCount = 1;
    if (newStatus === MessageStatus.READ) incrementData.readCount = 1;
    if (newStatus === MessageStatus.FAILED) incrementData.failedCount = 1;

    const updateData: any = {};
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
}
