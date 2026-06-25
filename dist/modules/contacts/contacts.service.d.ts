import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
export declare class ContactsService {
    private readonly prisma;
    private readonly importQueue;
    private readonly realtimeGateway;
    private readonly logger;
    constructor(prisma: PrismaService, importQueue: any, realtimeGateway: RealtimeGateway);
    private sanitizePhone;
    countContacts(orgId: string, tags?: string[]): Promise<{
        count: number;
    }>;
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
            contactId: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            chatbotId: string;
            accountId: string;
            currentNodeId: string;
            variables: import("@prisma/client/runtime/library").JsonValue;
            waitingForInput: boolean;
            waitingNodeType: string | null;
            expiresAt: Date | null;
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
            contactId: string;
            accountId: string;
            sequenceId: string;
            currentStepIndex: number;
            nextExecuteAt: Date | null;
            startedAt: Date;
            completedAt: Date | null;
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
            contactId: string;
            userId: string;
            body: string;
        })[];
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
    }>;
    uploadAvatar(orgId: string, contactId: string, file: any): Promise<{
        avatarUrl: string;
    }>;
    updateContact(orgId: string, contactId: string, data: any): Promise<{
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
    }>;
    createOrUpdate(orgId: string, phone: string, data: any): Promise<{
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
        }[];
        total: number;
        activeCount: number;
        blockedCount: number;
        page: number;
        limit: number;
        totalPages: number;
        debugOrgId: string;
    }>;
    getContactsCount(orgId: string, tags?: string[]): Promise<{
        count: number;
    }>;
    exportContacts(orgId: string, options: {
        search?: string;
        status?: string;
        tag?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<any[]>;
    getTagsAnalytics(orgId: string, includeSystem?: boolean): Promise<{
        name: string;
        count: number;
    }[]>;
    bulkAddTags(orgId: string, contactIds: string[], tags: string[]): Promise<({
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
    } | undefined)[]>;
    bulkRemoveTags(orgId: string, contactIds: string[], tags: string[]): Promise<({
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
    } | undefined)[]>;
    deleteContacts(orgId: string, contactIds: string[]): Promise<{
        count: number;
    }>;
    deleteContactsByTag(orgId: string, tag: string): Promise<{
        count: number;
    }>;
    deleteUntaggedContacts(orgId: string): Promise<{
        count: number;
    }>;
}
