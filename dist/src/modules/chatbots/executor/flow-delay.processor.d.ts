import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlowExecutorService } from './flow-executor.service';
export declare class FlowDelayProcessor {
    private readonly prisma;
    private readonly flowExecutor;
    private readonly logger;
    constructor(prisma: PrismaService, flowExecutor: FlowExecutorService);
    handleResumeAfterDelay(job: Job<any>): Promise<void>;
}
