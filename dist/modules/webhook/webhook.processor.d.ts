import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { FlowExecutorService } from '../chatbots/executor/flow-executor.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
export declare class WebhookProcessor {
    private readonly prisma;
    private readonly contactsService;
    private readonly messagingService;
    private readonly flowExecutor;
    private readonly whatsappService;
    private readonly realtimeGateway;
    private readonly logger;
    constructor(prisma: PrismaService, contactsService: ContactsService, messagingService: MessagingService, flowExecutor: FlowExecutorService, whatsappService: WhatsappService, realtimeGateway: RealtimeGateway);
    handleProcessMessage(job: Job<any>): Promise<void>;
    private handleStatusUpdate;
    handleIncomingMessage(accountId: string, organizationId: string, data: any): Promise<void>;
    handlePaymentUpdate(job: Job<any>): Promise<void>;
}
