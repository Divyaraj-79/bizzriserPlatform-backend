import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignStatus, CampaignLogLevel, MessageStatus } from '@prisma/client';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('campaign-messages') private readonly campaignQueue: Queue,
  ) {}

  async findAll(orgId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { recipients: true } }
      }
    });
  }

  async createBroadcast(orgId: string, data: { name: string, accountId: string, templateName: string, templateParams: any, contactIds: string[], scheduledAt?: string }) {
    const { name, accountId, templateName, templateParams, contactIds, scheduledAt } = data;

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    const isScheduled = scheduledDate && scheduledDate.getTime() > Date.now();

    // 1. Create Campaign
    const campaign = await this.prisma.campaign.create({
      data: {
        name,
        organizationId: orgId,
        templateName,
        templateParams: templateParams || [],
        status: isScheduled ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING,
        scheduledAt: scheduledDate,
        totalRecipients: contactIds.length,
        metadata: { accountId }
      }
    });

    // 2. Add recipients
    const recipientData = contactIds.map(id => ({
      campaignId: campaign.id,
      contactId: id,
      status: MessageStatus.PENDING
    }));

    await this.prisma.campaignRecipient.createMany({
      data: recipientData,
      skipDuplicates: true
    });

    await this.log(campaign.id, `Broadcast ${isScheduled ? 'scheduled for ' + scheduledDate!.toLocaleString() : 'started immediately'} with ${contactIds.length} recipients`, CampaignLogLevel.INFO);

    // 3. Handle Execution
    if (isScheduled) {
       // Enqueue a trigger job with delay
       const delay = scheduledDate!.getTime() - Date.now();
       await this.campaignQueue.add('start-campaign', {
          campaignId: campaign.id,
          orgId,
          accountId
       }, { delay });
       return { success: true, message: 'Broadcast scheduled successfully', campaignId: campaign.id };
    } else {
       // Start immediately
       return this.startCampaign(orgId, campaign.id, accountId);
    }
  }

  async startCampaign(orgId: string, campaignId: string, accountId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
      include: { recipients: true },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatus.CANCELLED) {
      this.logger.warn(`Campaign ${campaignId} was cancelled. Skipping start.`);
      return { success: false, message: 'Campaign was cancelled' };
    }

    // 1. Update status to RUNNING
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.RUNNING, startedAt: new Date() },
    });

    await this.log(campaignId, `Campaign execution initiated`, CampaignLogLevel.INFO);

    // 2. Prepare jobs
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

    // 3. Bulk enqueue
    await this.campaignQueue.addBulk(jobs);
    
    return { success: true, message: `Enqueued ${jobs.length} messages`, campaignId };
  }

  async cancelCampaign(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId }
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed campaign');
    }

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.CANCELLED }
    });

    await this.log(campaignId, `Campaign cancelled by user`, CampaignLogLevel.WARNING);
    return { success: true, message: 'Campaign cancelled successfully' };
  }

  async deleteCampaign(orgId: string, campaignId: string) {
    return this.prisma.campaign.delete({ where: { id: campaignId, organizationId: orgId } });
  }

  async getCampaign(orgId: string, campaignId: string) {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
      include: {
        recipients: { include: { contact: true }, take: 50 },
        logs: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
    });
  }

  async getExportData(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
      include: {
        recipients: { include: { contact: true } }
      }
    });

    if (!campaign) throw new NotFoundException('Campaign not found');

    const formatTime = (date: Date | null) => date ? date.toLocaleString() : 'N/A';

    return campaign.recipients.map(r => ({
      'Contact Name': `${r.contact.firstName || ''} ${r.contact.lastName || ''}`.trim() || 'WhatsApp User',
      'Phone Number': r.contact.phone,
      'Overall Status': r.status,
      'Sent At': formatTime(r.sentAt),
      'Delivered At': formatTime(r.deliveredAt),
      'Read At': formatTime(r.readAt),
      'Failed At': formatTime(r.failedAt),
      'Failure Reason': r.failureReason || ''
    }));
  }

  async log(campaignId: string, message: string, level: CampaignLogLevel = CampaignLogLevel.INFO, metadata: any = {}) {
    return this.prisma.campaignLog.create({
      data: { campaignId, message, level, metadata },
    });
  }
}
