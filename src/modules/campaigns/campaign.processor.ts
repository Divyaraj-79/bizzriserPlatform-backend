import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { CampaignsService } from './campaigns.service';
import { CampaignStatus, MessageStatus, CampaignLogLevel } from '@prisma/client';

@Processor('campaign-messages')
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @Process('start-campaign')
  async handleStartCampaign(job: Job<any>) {
    const { campaignId, orgId, accountId } = job.data;
    this.logger.log(`Scheduled campaign ${campaignId} triggered. Starting now.`);
    
    try {
      await this.campaignsService.startCampaign(orgId, campaignId, accountId);
    } catch (error) {
       this.logger.error(`Failed to start scheduled campaign ${campaignId}: ${error.message}`);
       throw error;
    }
  }

  @Process('send-message')
  async handleSendMessage(job: Job<any>) {
    const { campaignId, recipientId, orgId, accountId, contactId, templateName, templateParams } = job.data;
    
    this.logger.debug(`Processing campaign message for recipient ${recipientId}`);

    try {
      // 1. Check if campaign is STILL running (and not cancelled)
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true, name: true, totalRecipients: true, sentCount: true, failedCount: true },
      });

      if (!campaign || campaign.status === ('CANCELLED' as any)) {
        this.logger.warn(`Campaign ${campaignId} is CANCELLED. Skipping message for recipient ${recipientId}.`);
        return;
      }

      // 2. Fetch Contact
      const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) throw new Error('Contact not found');

      // 3. Map Parameters
      const bodyParameters = (templateParams || [])
        .sort((a: any, b: any) => a.index - b.index)
        .map((p: any) => ({
          type: 'text',
          text: p.field ? (contact[p.field as keyof typeof contact] || '') : p.value
        }));

      const components = [ { type: 'body', parameters: bodyParameters } ];

      // 4. Send template message 
      await this.messagingService.sendTemplateMessage(
        orgId, accountId, contactId, templateName, 'en_US', components, { campaignId }
      );

      // 5. Update recipient and campaign
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
      });

      // 6. Completion check
      if (updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
        });
        await this.campaignsService.log(campaignId, 'Broadcast completed successfully', CampaignLogLevel.INFO);
      }

    } catch (error: any) {
      this.logger.error(`Failed to process campaign message for recipient ${recipientId}: ${error.message}`);
      
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          failedCount: { increment: 1 },
          recipients: {
            update: {
              where: { id: recipientId },
              data: { status: MessageStatus.FAILED, failedAt: new Date(), failureReason: error.message } as any,
            },
          },
        },
      });

      await this.campaignsService.log(campaignId, `Message failed for recipient ${contactId}: ${error.message}`, CampaignLogLevel.ERROR);
      throw error;
    }
  }
}
