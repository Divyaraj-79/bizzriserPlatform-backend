import { CampaignsService } from './campaigns.service';
export declare class CampaignsController {
    private readonly campaignsService;
    constructor(campaignsService: CampaignsService);
    create(req: any, data: any): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        description: string | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
    }>;
    findOne(req: any, id: string): Promise<{
        recipients: {
            id: string;
            status: import(".prisma/client").$Enums.MessageStatus;
            createdAt: Date;
            sentAt: Date | null;
            contactId: string;
            campaignId: string;
        }[];
        logs: {
            message: string;
            id: string;
            createdAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            level: import(".prisma/client").$Enums.CampaignLogLevel;
            campaignId: string;
        }[];
    } & {
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        description: string | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
    }>;
    addRecipients(req: any, id: string, contactIds: string[]): Promise<import(".prisma/client").Prisma.BatchPayload>;
    start(req: any, id: string, accountId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
