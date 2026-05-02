import { ContactsService } from './contacts.service';
export declare class ContactsController {
    private readonly contactsService;
    constructor(contactsService: ContactsService);
    create(req: any, data: any): Promise<{
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
    bulkCreate(req: any, data: {
        contacts: any[];
    }): Promise<{
        jobId: any;
        totalContacts: number;
        originalCount: number;
        status: string;
    }>;
    findAll(req: any, page?: string, limit?: string, search?: string, status?: string, tag?: string): Promise<{
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
    update(req: any, id: string, data: any): Promise<{
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
    getTagsAnalytics(req: any): Promise<{
        name: string;
        count: number;
    }[]>;
    bulkAddTags(req: any, body: {
        contactIds: string[];
        tags: string[];
    }): Promise<({
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
    bulkRemoveTags(req: any, body: {
        contactIds: string[];
        tags: string[];
    }): Promise<({
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
    bulkDelete(req: any, body: {
        contactIds: string[];
    }): Promise<import(".prisma/client").Prisma.BatchPayload>;
    getImportStatus(jobId: string): Promise<{
        id: string;
        status: any;
        progress: number;
        current: number;
        total: number;
        result: any;
        error: any;
    }>;
}
