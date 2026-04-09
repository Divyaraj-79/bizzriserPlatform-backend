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
        select: { status: true, name: true, totalRecipients: true, sentCount: true, failedCount: true, metadata: true },
      });

      if (!campaign || campaign.status === ('CANCELLED' as any)) {
        this.logger.warn(`Campaign ${campaignId} is CANCELLED. Skipping message for recipient ${recipientId}.`);
        return;
      }

      // 2. Fetch Contact
      const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) throw new Error('Contact not found');

      // 3. Map Parameters using new WhatsAppTemplate mappings
      const templateLanguage = (campaign.metadata as any)?.templateLanguage;

      const mappingRecord = await this.prisma.whatsAppTemplate.findFirst({
         where: { 
            accountId, 
            name: templateName,
            language: templateLanguage || undefined
         }
      });

      const variableMapping = mappingRecord?.variableMapping as any || {};
      const bodyParameters: any[] = [];

      // If we have a local mapping, use it to resolve variables from the contact
      if (Object.keys(variableMapping).length > 0) {
        const broadcastParams = templateParams as any[] || [];
        
        Object.keys(variableMapping)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .forEach(index => {
            const broadcastParam = broadcastParams.find(p => String(p.index) === String(index));
            let text = '';

            // 1. Prioritize static value from broadcast UI
            if (broadcastParam?.value) {
                text = broadcastParam.value;
            } else {
              // 2. Resolve via mapping (either broadcast-specific or template-default)
              const fieldKey = broadcastParam?.field || variableMapping[index];
              if (fieldKey.startsWith('custom:')) {
                const cfKey = fieldKey.replace('custom:', '');
                text = (contact.customFields as any)?.[cfKey] || '';
              } else if (fieldKey.startsWith('var:')) {
                const varKey = fieldKey.replace('var:', '');
                text = (templateParams as any)?.[varKey] || (templateParams as any)?.find?.((p: any) => p.name === varKey)?.value || '';
              } else if (fieldKey) {
                text = (contact as any)[fieldKey] || '';
              }
            }
            
            bodyParameters.push({ type: 'text', text: String(text || '') });
          });
      } else {
        // Fallback to old behavior if no local mapping exists
        (templateParams || [])
          .sort((a: any, b: any) => a.index - b.index)
          .forEach((p: any) => {
            let text = '';
            if (p.field) {
              text = (contact as any)[p.field] || (contact.customFields as any)?.[p.field] || '';
            } else {
              text = p.value || '';
            }
            bodyParameters.push({ type: 'text', text: String(text || '') });
          });
      }

      const components = [ { type: 'body', parameters: bodyParameters } ];

      // 4. Send template message 
      const finalLanguage = templateLanguage || mappingRecord?.language || 'en_US';
      await this.messagingService.sendTemplateMessage(
        orgId, accountId, contactId, templateName, finalLanguage, components, { campaignId }
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
