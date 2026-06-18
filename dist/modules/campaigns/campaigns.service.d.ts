import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MessagingService } from '../messaging/messaging.service';
import { CampaignLogLevel, MessageStatus } from '@prisma/client';
export declare class CampaignsService {
    private readonly prisma;
    private readonly contactsService;
    private readonly realtimeGateway;
    private readonly messagingService;
    private readonly campaignQueue;
    private readonly logger;
    constructor(prisma: PrismaService, contactsService: ContactsService, realtimeGateway: RealtimeGateway, messagingService: MessagingService, campaignQueue: Queue);
    findAll(orgId: string, accountContext?: string | string[]): Promise<{
        readCount: number;
        deliveredCount: number;
        sentCount: number;
        _count: {
            recipients: number;
        };
        id: string;
        organizationId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        description: string | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        totalRecipients: number;
        failedCount: number;
        responseCount: number;
    }[]>;
    createBroadcast(orgId: string, data: {
        name: string;
        accountId: string;
        templateName: string;
        templateParams: any;
        contactIds?: string[];
        targetTag?: string;
        targetTags?: string[];
        numbers?: string[];
        tagName?: string;
        autoSegment?: boolean;
        sendAnyways?: boolean;
        scheduledAt?: string;
        saveAsDraft?: boolean;
        batches?: {
            size: number;
            scheduledAt: string;
        }[];
        targetType?: string;
        targetName?: any;
    }): Promise<{
        success: boolean;
        message: string;
        campaignId?: undefined;
        segmentedCount?: undefined;
    } | {
        success: boolean;
        message: string;
        campaignId: string;
        segmentedCount: number;
    }>;
    updateCampaign(orgId: string, campaignId: string, data: {
        name?: string;
        scheduledAt?: string;
    }): Promise<{
        success: boolean;
        message: string;
        campaign: {
            id: string;
            organizationId: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            status: import(".prisma/client").$Enums.CampaignStatus;
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
            responseCount: number;
        };
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
    triggerCampaign(orgId: string, campaignId: string): Promise<{
        success: boolean;
        message: string;
        campaignId?: undefined;
    } | {
        success: boolean;
        message: string;
        campaignId: string;
    }>;
    sendInstantScheduledCampaign(orgId: string, campaignId: string): Promise<{
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
    deleteCampaign(orgId: string, campaignId: string): Promise<[import(".prisma/client").Prisma.BatchPayload, import(".prisma/client").Prisma.BatchPayload, {
        id: string;
        organizationId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
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
        responseCount: number;
    }]>;
    getCampaign(orgId: string, campaignId: string): Promise<{
        readCount: number;
        deliveredCount: number;
        sentCount: number;
        recipients: ({
            contact: {
                id: string;
                organizationId: string;
                createdAt: Date;
                updatedAt: Date;
                status: import(".prisma/client").$Enums.ContactStatus;
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
            contactId: string;
            createdAt: Date;
            status: import(".prisma/client").$Enums.MessageStatus;
            sentAt: Date | null;
            deliveredAt: Date | null;
            readAt: Date | null;
            failedAt: Date | null;
            failureReason: string | null;
            campaignId: string;
            firstResponse: string | null;
            firstResponseAt: Date | null;
        })[];
        logs: {
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
            message: string;
            campaignId: string;
            level: import(".prisma/client").$Enums.CampaignLogLevel;
        }[];
        id: string;
        organizationId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        description: string | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        totalRecipients: number;
        failedCount: number;
        responseCount: number;
    } | null>;
    getExportData(orgId: string, campaignId: string): Promise<{
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
    sendTestMessage(orgId: string, data: {
        accountId: string;
        phone: string;
        templateName: string;
        language?: string;
        components?: any[];
    }): Promise<{
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }>;
    log(campaignId: string, message: string, level?: CampaignLogLevel, metadata?: any): Promise<{
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        message: string;
        campaignId: string;
        level: import(".prisma/client").$Enums.CampaignLogLevel;
    }>;
    updateCampaignStats(campaignId: string, oldStatus: MessageStatus, newStatus: MessageStatus): Promise<{
        id: string;
        organizationId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
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
        responseCount: number;
    } | null | undefined>;
}
