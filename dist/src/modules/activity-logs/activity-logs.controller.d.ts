import { ActivityLoggerService } from './activity-logger.service';
export declare class ActivityLogsController {
    private readonly activityLoggerService;
    constructor(activityLoggerService: ActivityLoggerService);
    findAll(req: any, page?: string, limit?: string, userId?: string): Promise<{
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
