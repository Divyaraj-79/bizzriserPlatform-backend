import { ContactsService } from './contacts.service';
export declare class ContactsController {
    private readonly contactsService;
    constructor(contactsService: ContactsService);
    findAll(req: any): Promise<{
        id: string;
        organizationId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        status: import(".prisma/client").$Enums.ContactStatus;
        avatarUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        whatsappId: string | null;
        phone: string;
        tags: string[];
        customFields: import("@prisma/client/runtime/library").JsonValue;
        optedInAt: Date | null;
        optedOutAt: Date | null;
        lastContactedAt: Date | null;
    }[]>;
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
        whatsappId: string | null;
        phone: string;
        tags: string[];
        customFields: import("@prisma/client/runtime/library").JsonValue;
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
        whatsappId: string | null;
        phone: string;
        tags: string[];
        customFields: import("@prisma/client/runtime/library").JsonValue;
        optedInAt: Date | null;
        optedOutAt: Date | null;
        lastContactedAt: Date | null;
    } | undefined)[]>;
    bulkDelete(req: any, body: {
        contactIds: string[];
    }): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
