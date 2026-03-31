import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { CampaignStatus, MessageStatus, CampaignLogLevel } from '@prisma/client';

@Processor('campaign-messages')
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
  ) {}

  @Process('send-message')
  async handleSendMessage(job: Job<any>) {
    const { campaignId, recipientId, orgId, accountId, contactId } = job.data;
    
    this.logger.debug(`Processing campaign message for recipient ${recipientId}`);

    try {
      // 1. Check if campaign is still running
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true, name: true },
      });

      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        this.logger.warn(`Campaign ${campaignId} is no longer running. Skipping job.`);
        return;
      }

      // 2. Fetch template details (Placeholder logic: templates are just text for now)
      const body = `Hello! This is a message from campaign ${campaign.name}`; // Simple placeholder

      // 3. Send message via MessagingService (Handles deduplication & conversation)
      await this.messagingService.sendTextMessage(orgId, accountId, contactId, body);

      // 4. Update recipient status and campaign counts atomically
      const updatedCampaign = await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          sentCount: { increment: 1 },
          recipients: {
            update: {
              where: { id: recipientId },
              data: { status: MessageStatus.SENT, sentAt: new Date() },
            },
          },
        },
        include: { _count: { select: { recipients: true } } }, // This might not be right way to get total
      });

      // 5. Completion Check (Using simple count check for this task)
      const totalRecipients = await this.prisma.campaignRecipient.count({ where: { campaignId } });
      if (updatedCampaign.sentCount + updatedCampaign.failedCount >= totalRecipients) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
        });
        await this.logToCampaign(campaignId, 'Campaign completed successfully', CampaignLogLevel.INFO);
      }

    } catch (error) {
      this.logger.error(`Failed to process campaign message for recipient ${recipientId}: ${error.message}`);
      
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          failedCount: { increment: 1 },
          recipients: {
            update: {
              where: { id: recipientId },
              data: { status: MessageStatus.FAILED },
            },
          },
        },
      });

      await this.logToCampaign(campaignId, `Message failed for recipient ${recipientId}: ${error.message}`, CampaignLogLevel.ERROR);
      throw error; // Rethrow for BullMQ retry
    }
  }

  private async logToCampaign(campaignId: string, message: string, level: CampaignLogLevel) {
    await this.prisma.campaignLog.create({
      data: {
        campaignId,
        message,
        level,
      },
    });
  }
}
