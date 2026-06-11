import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
export declare class WebhookService {
    private readonly config;
    private readonly prisma;
    private readonly webhookQueue;
    private readonly logger;
    constructor(config: ConfigService, prisma: PrismaService, webhookQueue: Queue);
    verifyWebhook(mode: string, token: string, challenge: string): string;
    handleIncomingWebhook(signature: string, payload: any, rawBody?: Buffer): Promise<{
        status: string;
    }>;
    private validateSignature;
    private processMessageEvent;
}
