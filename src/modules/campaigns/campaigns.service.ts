import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignStatus, CampaignLogLevel } from '@prisma/client';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('campaign-messages') private readonly campaignQueue: Queue,
  ) {}

  async create(orgId: string, data: any) {
    const campaign = await this.prisma.campaign.create({
      data: { ...data, organizationId: orgId },
    });
    await this.log(campaign.id, 'Campaign created as DRAFT', CampaignLogLevel.INFO);
    return campaign;
  }

  async getCampaign(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
      include: {
        recipients: { take: 10 }, // Last 10 recipients
        logs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async addRecipients(orgId: string, campaignId: string, contactIds: string[]) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const data = contactIds.map((contactId) => ({
      campaignId,
      contactId,
    }));

    // Use createMany to ignore duplicates (Prisma supports skipDuplicates)
    const result = await this.prisma.campaignRecipient.createMany({
      data,
      skipDuplicates: true,
    });

    await this.log(
      campaignId,
      `Added ${result.count} contacts to campaign. Total recipients now in queue.`,
      CampaignLogLevel.INFO,
    );

    return result;
  }

  async log(campaignId: string, message: string, level: CampaignLogLevel = CampaignLogLevel.INFO, metadata: any = {}) {
    return this.prisma.campaignLog.create({
      data: {
        campaignId,
        message,
        level,
        metadata,
      },
    });
  }

  async startCampaign(orgId: string, campaignId: string, accountId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId, organizationId: orgId },
      include: { recipients: true },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('Campaign is already running');
    }

    // 1. Update status to RUNNING
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.RUNNING, startedAt: new Date() },
    });

    await this.log(campaignId, `Campaign started with ${campaign.recipients.length} recipients`, CampaignLogLevel.INFO);

    // 2. Prepare jobs
    const jobs = campaign.recipients.map((recipient) => ({
      name: 'send-message',
      data: {
        campaignId: campaign.id,
        recipientId: recipient.id,
        orgId: campaign.organizationId,
        accountId, // Which WhatsApp account to use
        contactId: recipient.contactId,
        templateName: campaign.templateName,
        templateParams: campaign.templateParams,
      },
    }));

    // 3. Bulk enqueue
    await this.campaignQueue.addBulk(jobs);
    
    this.logger.log(`Enqueued ${jobs.length} messages for campaign ${campaign.name}`);
    return { success: true, message: `Enqueued ${jobs.length} messages` };
  }
}
