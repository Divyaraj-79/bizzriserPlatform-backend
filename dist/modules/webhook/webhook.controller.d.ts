import { WebhookService } from './webhook.service';
export declare class WebhookController {
    private readonly webhookService;
    private readonly logger;
    constructor(webhookService: WebhookService);
    verify(query: any): string;
    handleWebhook(req: any, signature: string, payload: any): Promise<{
        status: string;
    }>;
}
