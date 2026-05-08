import { CampaignsService } from './campaigns.service';
export declare class CampaignsController {
    private readonly campaignsService;
    constructor(campaignsService: CampaignsService);
    findAll(req: any, accountId?: string): Promise<({
        _count: {
            recipients: number;
        };
    } & {
        description: string | null;
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
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
                whatsappId: string | null;
                phone: string;
                firstName: string | null;
                lastName: string | null;
                email: string | null;
                avatarUrl: string | null;
                status: import(".prisma/client").$Enums.ContactStatus;
                tags: string[];
                customFields: import("@prisma/client/runtime/library").JsonValue;
                agentId: string | null;
                optedInAt: Date | null;
                optedOutAt: Date | null;
                lastContactedAt: Date | null;
                createdAt: Date;
                updatedAt: Date;
            };
        } & {
            id: string;
            status: import(".prisma/client").$Enums.MessageStatus;
            createdAt: Date;
            contactId: string;
            sentAt: Date | null;
            deliveredAt: Date | null;
            readAt: Date | null;
            failedAt: Date | null;
            failureReason: string | null;
            campaignId: string;
        })[];
        logs: {
            id: string;
            createdAt: Date;
            message: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            campaignId: string;
            level: import(".prisma/client").$Enums.CampaignLogLevel;
        }[];
    } & {
        description: string | null;
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
    }) | null>;
    deleteCampaign(req: any, id: string): Promise<{
        description: string | null;
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
    }>;
    exportCampaign(req: any, id: string): Promise<{
        Contact: string;
        Phone: string;
        Status: import(".prisma/client").$Enums.MessageStatus;
        'Sent At': string;
        'Delivered At': any;
        'Read At': any;
        'Failed At': any;
        Error: any;
    }[]>;
}
