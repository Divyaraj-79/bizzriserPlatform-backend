import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookProcessor } from './webhook.processor';
export declare class WebhookService {
    private readonly config;
    private readonly prisma;
    private readonly webhookQueue;
    private readonly webhookProcessor;
    private readonly logger;
    constructor(config: ConfigService, prisma: PrismaService, webhookQueue: Queue, webhookProcessor: WebhookProcessor);
    verifyWebhook(mode: string, token: string, challenge: string): string;
    handleIncomingWebhook(signature: string, payload: any, rawBody?: Buffer): Promise<{
        status: string;
    }>;
    private validateSignature;
    private processMessageEvent;
}
