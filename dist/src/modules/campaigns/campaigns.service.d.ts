import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignLogLevel } from '@prisma/client';
export declare class CampaignsService {
    private readonly prisma;
    private readonly campaignQueue;
    private readonly logger;
    constructor(prisma: PrismaService, campaignQueue: Queue);
    create(orgId: string, data: any): Promise<{
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
    getCampaign(orgId: string, campaignId: string): Promise<{
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
    addRecipients(orgId: string, campaignId: string, contactIds: string[]): Promise<import(".prisma/client").Prisma.BatchPayload>;
    log(campaignId: string, message: string, level?: CampaignLogLevel, metadata?: any): Promise<{
        message: string;
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        level: import(".prisma/client").$Enums.CampaignLogLevel;
        campaignId: string;
    }>;
    startCampaign(orgId: string, campaignId: string, accountId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
