import { PrismaService } from '../../prisma/prisma.service';
export declare class DataRetentionService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleDataRetention(): Promise<void>;
}
