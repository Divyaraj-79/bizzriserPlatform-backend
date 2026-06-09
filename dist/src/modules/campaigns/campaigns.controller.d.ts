import { CampaignsService } from './campaigns.service';
export declare class CampaignsController {
    private readonly campaignsService;
    constructor(campaignsService: CampaignsService);
    findAll(req: any, accountId?: string): Promise<({
        _count: {
            recipients: number;
        };
    } & {
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        status: import(".prisma/client").$Enums.CampaignStatus;
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
        responseCount: number;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    createBroadcast(req: any, data: any): Promise<{
        success: boolean;
        message: string;
        campaignId?: undefined;
    } | {
        success: boolean;
        message: string;
        campaignId: string;
    } | {
        success: boolean;
        message: string;
        campaignId: string;
        segmentedCount: number;
    }>;
    cancelBroadcast(req: any, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getCampaign(req: any, id: string): Promise<({
        recipients: ({
            contact: {
                id: string;
                organizationId: string;
                status: import(".prisma/client").$Enums.ContactStatus;
                createdAt: Date;
                updatedAt: Date;
                whatsappId: string | null;
                phone: string;
                firstName: string | null;
                lastName: string | null;
                email: string | null;
                avatarUrl: string | null;
                tags: string[];
                customFields: import("@prisma/client/runtime/library").JsonValue;
                agentId: string | null;
                optedInAt: Date | null;
                optedOutAt: Date | null;
                lastContactedAt: Date | null;
            };
        } & {
            id: string;
            status: import(".prisma/client").$Enums.MessageStatus;
            createdAt: Date;
            campaignId: string;
            contactId: string;
            sentAt: Date | null;
            deliveredAt: Date | null;
            readAt: Date | null;
            failedAt: Date | null;
            failureReason: string | null;
            firstResponse: string | null;
            firstResponseAt: Date | null;
        })[];
        logs: {
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
            campaignId: string;
            message: string;
            level: import(".prisma/client").$Enums.CampaignLogLevel;
        }[];
    } & {
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        status: import(".prisma/client").$Enums.CampaignStatus;
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
        responseCount: number;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }) | null>;
    deleteCampaign(req: any, id: string): Promise<[import(".prisma/client").Prisma.BatchPayload, import(".prisma/client").Prisma.BatchPayload, {
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        status: import(".prisma/client").$Enums.CampaignStatus;
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
        responseCount: number;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }]>;
    exportCampaign(req: any, id: string): Promise<{
        Contact: string;
        Phone: string;
        Status: import(".prisma/client").$Enums.MessageStatus;
        'Sent At': string;
        'Delivered At': any;
        'Read At': any;
        'Failed At': any;
        'First Response': any;
        'Responded At': any;
        Error: any;
    }[]>;
}
