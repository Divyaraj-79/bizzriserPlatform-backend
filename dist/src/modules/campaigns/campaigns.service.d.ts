import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { CampaignLogLevel } from '@prisma/client';
export declare class CampaignsService {
    private readonly prisma;
    private readonly contactsService;
    private readonly campaignQueue;
    private readonly logger;
    constructor(prisma: PrismaService, contactsService: ContactsService, campaignQueue: Queue);
    findAll(orgId: string, accountContext?: string | string[]): Promise<({
        _count: {
            recipients: number;
        };
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
    })[]>;
    createBroadcast(orgId: string, data: {
        name: string;
        accountId: string;
        templateName: string;
        templateParams: any;
        contactIds?: string[];
        targetTag?: string;
        numbers?: string[];
        tagName?: string;
        autoSegment?: boolean;
        scheduledAt?: string;
    }): Promise<{
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
    private getUpdatedTagsForLeftovers;
    startCampaign(orgId: string, campaignId: string, accountId: string): Promise<{
        success: boolean;
        message: string;
        campaignId?: undefined;
    } | {
        success: boolean;
        message: string;
        campaignId: string;
    }>;
    cancelCampaign(orgId: string, campaignId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteCampaign(orgId: string, campaignId: string): Promise<{
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
    getCampaign(orgId: string, campaignId: string): Promise<({
        logs: {
            message: string;
            id: string;
            createdAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            campaignId: string;
            level: import(".prisma/client").$Enums.CampaignLogLevel;
        }[];
        recipients: ({
            contact: {
                id: string;
                organizationId: string;
                email: string | null;
                firstName: string | null;
                lastName: string | null;
                status: import(".prisma/client").$Enums.ContactStatus;
                avatarUrl: string | null;
                createdAt: Date;
                updatedAt: Date;
                customFields: import("@prisma/client/runtime/library").JsonValue;
                whatsappId: string | null;
                phone: string;
                tags: string[];
                agentId: string | null;
                optedInAt: Date | null;
                optedOutAt: Date | null;
                lastContactedAt: Date | null;
            };
        } & {
            id: string;
            status: import(".prisma/client").$Enums.MessageStatus;
            createdAt: Date;
            sentAt: Date | null;
            deliveredAt: Date | null;
            readAt: Date | null;
            failedAt: Date | null;
            failureReason: string | null;
            contactId: string;
            campaignId: string;
        })[];
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
    }) | null>;
    getExportData(orgId: string, campaignId: string): Promise<{
        Contact: string;
        Phone: string;
        Status: import(".prisma/client").$Enums.MessageStatus;
        'Sent At': string;
        'Delivered At': any;
        'Read At': any;
        'Failed At': any;
        Error: any;
    }[]>;
    log(campaignId: string, message: string, level?: CampaignLogLevel, metadata?: any): Promise<{
        message: string;
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        campaignId: string;
        level: import(".prisma/client").$Enums.CampaignLogLevel;
    }>;
}
