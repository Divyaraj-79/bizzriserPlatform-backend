import { Process, Processor, InjectQueue } from '@nestjs/bull';
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
    @InjectQueue('campaign-messages') private readonly campaignQueue: any,
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

  @Process('build-audience')
  async handleBuildAudience(job: Job<any>) {
    const { campaignId, orgId, accountId, finalContactIds, leftoverContactIds, targetTag, autoSegment, isScheduled, scheduledAt, saveAsDraft } = job.data;
    this.logger.log(`Building audience for campaign ${campaignId}. Target contacts: ${finalContactIds.length}`);

    try {
      // 1. Handle autoSegment tagging
      if (autoSegment && leftoverContactIds && leftoverContactIds.length > 0) {
        if (targetTag) {
          const leftoverTag = `leftover_${targetTag}`;
          
          // Re-tag leftovers with raw query to handle JSONB array properly
          // Note: In real production, this should ideally use an append logic if tags exist
          // but Prisma doesn't support jsonb array append natively yet, so we just set it.
          await this.prisma.contact.updateMany({
             where: { id: { in: leftoverContactIds } },
             data: {
                tags: [leftoverTag] as any // Assuming simplified tag setting for autoSegment
             }
          });
          this.logger.debug(`Retagged ${leftoverContactIds.length} leftovers with ${leftoverTag}`);
        }
      }

      // 2. Add recipients in chunks
      const recipientData = finalContactIds.map((id: string) => ({
        campaignId,
        contactId: id,
        status: MessageStatus.PENDING
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
      await this.campaignsService.log(campaignId, `Broadcast audience built with ${finalContactIds.length} recipients.${segmentedMsg}`, CampaignLogLevel.INFO);

      // 3. Initiate next step
      if (!saveAsDraft && !isScheduled) {
         await this.campaignsService.startCampaign(orgId, campaignId, accountId);
      } else if (!saveAsDraft && isScheduled && scheduledAt) {
         const delay = new Date(scheduledAt).getTime() - Date.now();
         await this.campaignQueue.add(
            'start-campaign', 
            { campaignId, orgId, accountId }, 
            { 
               delay: delay > 0 ? delay : 0,
               jobId: `start-${campaignId}`
            }
         );
         this.logger.log(`Queued scheduled campaign ${campaignId} with delay ${delay}ms`);
      }
    } catch (err: any) {
      this.logger.error(`Audience building failed for campaign ${campaignId}: ${err.message}`);
      await this.campaignsService.log(campaignId, `Audience building failed: ${err.message}`, CampaignLogLevel.ERROR);
    }
  }

  @Process({ name: 'send-message', concurrency: 50 })
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

      // 2. Fetch Recipient and Contact
      const recipient = await this.prisma.campaignRecipient.findUnique({ where: { id: recipientId } });
      if (!recipient) throw new Error('Recipient not found');
      const oldStatus = recipient.status;

      const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) throw new Error('Contact not found');

      const phoneDigits = contact.phone.replace(/\D/g, '');
      if (phoneDigits.length < 4 || phoneDigits.length > 15) {
         this.logger.warn(`Campaign ${campaignId} skipping recipient ${recipientId} due to invalid phone length: ${contact.phone}`);
         await this.prisma.campaignRecipient.update({
            where: { id: recipientId },
            data: { status: MessageStatus.FAILED, failureReason: `Invalid phone length (${phoneDigits.length} digits)` }
         });
         await this.campaignsService.updateCampaignStats(campaignId, oldStatus, MessageStatus.FAILED);
         return;
      }

      // 3. Map Parameters using new WhatsAppTemplate mappings
      const templateLanguage = (campaign.metadata as any)?.templateLanguage;

      const mappingRecord = await this.prisma.whatsAppTemplate.findFirst({
         where: { 
            accountId, 
            name: templateName,
            language: templateLanguage || undefined
         }
      });

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
            const varKey = fieldKey.replace('var:', '');
            text = (templateParams as any)?.[varKey] || (templateParams as any)?.find?.((p: any) => p.name === varKey)?.value || '';
          } else {
            text = (contact as any)[fieldKey] || (contact.customFields as any)?.[fieldKey] || '';
          }
        }
        return text;
      };

      const components: any[] = [];
      const broadcastParams = (templateParams as any[]) || [];

      // 1. Build HEADER parameters
      const headerParams = broadcastParams.filter(p => p.componentType === 'HEADER');
      if (headerParams.length > 0) {
        const headerParameters: any[] = [];
        headerParams.forEach(p => {
          const resolvedValue = resolveParamValue(p);
          
          if (p.mediaType && p.mediaType !== 'TEXT') {
            const mediaValue = String(resolvedValue || '').trim();
            
            // Guard: skip empty media values to avoid sending invalid requests to Meta
            if (!mediaValue) {
              this.logger.warn(`[Campaign ${campaignId}] Skipping empty media header for recipient ${recipientId}. Template: ${templateName}, mediaType: ${p.mediaType}`);
              return; // Skip this param
            }
            
            const isLink = mediaValue.startsWith('http://') || mediaValue.startsWith('https://');
            
            // Guard: reject incomplete URLs like bare 'https://' which cause Meta error 131053
            if (isLink && mediaValue.length < 12) {
              this.logger.error(`[Campaign ${campaignId}] BLOCKED: media URL "${mediaValue}" is not a complete URL (too short). This would cause Meta error 131053. Skipping. Template: ${templateName}`);
              return; // Skip this param
            }
            
            const mediaObj = isLink ? { link: mediaValue } : { id: mediaValue };

            
            if (p.mediaType === 'IMAGE') {
              headerParameters.push({ type: 'image', image: mediaObj });
            } else if (p.mediaType === 'VIDEO') {
              headerParameters.push({ type: 'video', video: mediaObj });
            } else if (p.mediaType === 'DOCUMENT') {
              headerParameters.push({ 
                type: 'document', 
                document: { 
                  ...mediaObj, 
                  filename: p.filename || 'Document.pdf' 
                } 
              });
            }
          } else {
            headerParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
          }
        });
        
        if (headerParameters.length > 0) {
          components.push({ type: 'header', parameters: headerParameters });
        }
      }


      // 2. Build BODY parameters
      const bodyParameters: any[] = [];
      const bodyParams = broadcastParams.filter(p => !p.componentType || p.componentType === 'BODY');
      
      if (bodyParams.length > 0) {
        bodyParams
          .sort((a, b) => parseInt(a.index) - parseInt(b.index))
          .forEach(p => {
            const resolvedValue = resolveParamValue(p);
            bodyParameters.push({ type: 'text', text: String(resolvedValue?.trim() || ' ') });
          });
      } else {
        const variableMapping = mappingRecord?.variableMapping as any || {};
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

      // 3. Build BUTTON parameters
      const buttonParams = broadcastParams.filter(p => p.componentType === 'BUTTON');
      if (buttonParams.length > 0) {
        const buttonsMap: Record<number, any[]> = {};
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

      // 4. Send template message 
      const finalLanguage = templateLanguage || mappingRecord?.language || 'en_US';
      const chatbotId = (campaign.metadata as any)?.chatbotId;
      await this.messagingService.sendTemplateMessage(
        orgId, accountId, contactId, templateName, finalLanguage, components, { 
          campaignId,
          ...(chatbotId && { chatbotId })
        }
      );

      // 5. Update recipient and campaign safely (progressive update)
      const currentRecipient = await this.prisma.campaignRecipient.findUnique({
        where: { id: recipientId },
        select: { status: true }
      });
      const oldRecipientStatus = currentRecipient?.status || MessageStatus.PENDING;
      
      const statusOrder: Record<string, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
      const currentOrder = statusOrder[oldRecipientStatus] || 0;
      const newOrder = statusOrder[MessageStatus.SENT] || 0;
      
      const recipientUpdate: any = { sentAt: new Date() };
      let finalStatus = oldRecipientStatus;
      
      if (newOrder > currentOrder) {
        recipientUpdate.status = MessageStatus.SENT;
        finalStatus = MessageStatus.SENT;
      }
      
      await this.prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: recipientUpdate,
      });
      await this.campaignsService.updateCampaignStats(campaignId, oldRecipientStatus, finalStatus);

      // 6. Completion check
      const updatedCampaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
      if (updatedCampaign && updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalRecipients) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
        });
        await this.campaignsService.log(campaignId, 'Broadcast completed successfully', CampaignLogLevel.INFO);
      }

    } catch (error: any) {
      this.logger.error(`Failed to process campaign message for recipient ${recipientId}: ${error.message}`);
      
      const currentRecipient = await this.prisma.campaignRecipient.findUnique({ where: { id: recipientId } });
      const currentStatus = currentRecipient?.status || MessageStatus.PENDING;

      if (currentStatus !== MessageStatus.FAILED) {
        await this.prisma.campaignRecipient.update({
          where: { id: recipientId },
          data: { status: MessageStatus.FAILED, failedAt: new Date(), failureReason: `PROCESSOR_V2: ${error.message}` } as any,
        });
        await this.campaignsService.updateCampaignStats(campaignId, currentStatus, MessageStatus.FAILED);
      }

      await this.campaignsService.log(campaignId, `Message failed for recipient ${contactId}: ${error.message}`, CampaignLogLevel.ERROR);
      throw error;
    }
  }
}
