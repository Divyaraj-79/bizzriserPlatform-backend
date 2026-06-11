import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
export declare class SequenceExecutorService {
    private prisma;
    private whatsappService;
    private readonly logger;
    constructor(prisma: PrismaService, whatsappService: WhatsappService);
    handleExecuteStep(job: Job<any>): Promise<void>;
    private markCompleted;
    private calculateDelay;
}
