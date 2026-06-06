import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
export declare class ContactsService {
    private readonly prisma;
    private readonly importQueue;
    private readonly realtimeGateway;
    private readonly logger;
    constructor(prisma: PrismaService, importQueue: any, realtimeGateway: RealtimeGateway);
    private sanitizePhone;
    findOne(orgId: string, contactId: string): Promise<{
        windowExpiresAt: Date | null;
        isInWindow: boolean;
        sessions: ({
            chatbot: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            organizationId: string;
            status: import(".prisma/client").$Enums.ChatbotSessionStatus;
            createdAt: Date;
            updatedAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            accountId: string;
            contactId: string;
            currentNodeId: string;
            variables: import("@prisma/client/runtime/library").JsonValue;
            waitingForInput: boolean;
            waitingNodeType: string | null;
            expiresAt: Date | null;
            chatbotId: string;
        })[];
        enrollments: ({
            sequence: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            organizationId: string;
            status: import(".prisma/client").$Enums.SequenceEnrollmentStatus;
            createdAt: Date;
            updatedAt: Date;
            accountId: string;
            startedAt: Date;
            completedAt: Date | null;
            contactId: string;
            currentStepIndex: number;
            nextExecuteAt: Date | null;
            sequenceId: string;
        })[];
        notes: ({
            author: {
                id: string;
                firstName: string;
                lastName: string;
                avatarUrl: string | null;
            };
        } & {
            id: string;
            organizationId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            contactId: string;
            body: string;
        })[];
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
    }>;
    uploadAvatar(orgId: string, contactId: string, file: any): Promise<{
        avatarUrl: string;
    }>;
    updateContact(orgId: string, contactId: string, data: any): Promise<{
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
    }>;
    createOrUpdate(orgId: string, phone: string, data: any): Promise<{
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
    }>;
    bulkCreateOrUpdate(orgId: string, contacts: any[]): Promise<{
        jobId: any;
        totalContacts: number;
        originalCount: number;
        duplicatesRemoved: number;
        newCount: number;
        status: string;
    }>;
    private escapeSql;
    atomicBulkImport(orgId: string, contacts: any[], onProgress?: (stats: {
        current: number;
        total: number;
    }) => void): Promise<{
        success: boolean;
        count: number;
    }>;
    getImportStatus(jobId: string): Promise<{
        id: string;
        status: any;
        progress: number;
        current: number;
        total: number;
        result: any;
        error: any;
    }>;
    findAll(orgId: string, options: {
        page: number;
        limit: number;
        search?: string;
        status?: string;
        tag?: string;
    }): Promise<{
        data: {
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
        }[];
        total: number;
        activeCount: number;
        blockedCount: number;
        page: number;
        limit: number;
        totalPages: number;
        debugOrgId: string;
    }>;
    getTagsAnalytics(orgId: string, includeSystem?: boolean): Promise<{
        name: string;
        count: number;
    }[]>;
    bulkAddTags(orgId: string, contactIds: string[], tags: string[]): Promise<({
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
    } | undefined)[]>;
    bulkRemoveTags(orgId: string, contactIds: string[], tags: string[]): Promise<({
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
    } | undefined)[]>;
    deleteContacts(orgId: string, contactIds: string[]): Promise<import(".prisma/client").Prisma.BatchPayload>;
    deleteContactsByTag(orgId: string, tag: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    deleteUntaggedContacts(orgId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
