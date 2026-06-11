import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { CampaignsService } from './campaigns.service';
export declare class CampaignProcessor {
    private readonly prisma;
    private readonly messagingService;
    private readonly campaignsService;
    private readonly campaignQueue;
    private readonly logger;
    constructor(prisma: PrismaService, messagingService: MessagingService, campaignsService: CampaignsService, campaignQueue: any);
    handleStartCampaign(job: Job<any>): Promise<void>;
    handleBuildAudience(job: Job<any>): Promise<void>;
    handleSendMessage(job: Job<any>): Promise<void>;
}
