import { PrismaService } from '../../prisma/prisma.service';
export declare class ActivityLoggerService {
    private prisma;
    constructor(prisma: PrismaService);
    log(userId: string, action: string, details?: any, ip?: string, userAgent?: string): Promise<{
        id: string;
        createdAt: Date;
        action: string;
        details: import("@prisma/client/runtime/library").JsonValue;
        ip: string | null;
        userAgent: string | null;
        userId: string;
    } | undefined>;
    findAllByOrganization(organizationId: string, options?: {
        page?: number;
        limit?: number;
        userId?: string;
    }): Promise<{
        data: ({
            user: {
                email: string;
                firstName: string;
                lastName: string;
            };
        } & {
            id: string;
            createdAt: Date;
            action: string;
            details: import("@prisma/client/runtime/library").JsonValue;
            ip: string | null;
            userAgent: string | null;
            userId: string;
        })[];
        total: number;
        page: number;
        limit: number;
    }>;
}
