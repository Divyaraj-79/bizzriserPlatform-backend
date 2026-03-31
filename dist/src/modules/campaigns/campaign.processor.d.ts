import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
export declare class CampaignProcessor {
    private readonly prisma;
    private readonly messagingService;
    private readonly logger;
    constructor(prisma: PrismaService, messagingService: MessagingService);
    handleSendMessage(job: Job<any>): Promise<void>;
    private logToCampaign;
}
