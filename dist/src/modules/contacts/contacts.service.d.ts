import { PrismaService } from '../../prisma/prisma.service';
export declare class ContactsService {
    private readonly prisma;
    private readonly importQueue;
    private readonly logger;
    constructor(prisma: PrismaService, importQueue: any);
    private sanitizePhone;
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
    getTagsAnalytics(orgId: string): Promise<{
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
    deleteContacts(orgId: string, contactIds: string[]): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
