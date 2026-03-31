import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
export declare class WebhookProcessor {
    private readonly prisma;
    private readonly contactsService;
    private readonly messagingService;
    private readonly logger;
    constructor(prisma: PrismaService, contactsService: ContactsService, messagingService: MessagingService);
    handleProcessMessage(job: Job<any>): Promise<void>;
}
