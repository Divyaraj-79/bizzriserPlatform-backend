import { ContactsService } from './contacts.service';
export declare class ContactsController {
    private readonly contactsService;
    constructor(contactsService: ContactsService);
    create(req: any, data: any): Promise<{
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
    bulkCreate(req: any, data: {
        contacts: any[];
    }): Promise<{
        jobId: any;
        totalContacts: number;
        uniqueContacts: number;
        status: string;
    }>;
    findAll(req: any, page?: string, limit?: string, search?: string, status?: string, tag?: string): Promise<{
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
    update(req: any, id: string, data: any): Promise<{
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
    bulkRemoveTags(req: any, body: {
        contactIds: string[];
        tags: string[];
    }): Promise<({
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
    bulkDelete(req: any, body: {
        contactIds: string[];
    }): Promise<import(".prisma/client").Prisma.BatchPayload>;
    getImportStatus(jobId: string): Promise<{
        id: string;
        status: any;
        progress: number;
        result: any;
        error: any;
    }>;
}
