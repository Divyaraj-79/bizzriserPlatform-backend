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
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
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
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
            message: string;
            level: import(".prisma/client").$Enums.CampaignLogLevel;
            campaignId: string;
        }[];
    } & {
        id: string;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string;
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
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        message: string;
        level: import(".prisma/client").$Enums.CampaignLogLevel;
        campaignId: string;
    }>;
    startCampaign(orgId: string, campaignId: string, accountId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
