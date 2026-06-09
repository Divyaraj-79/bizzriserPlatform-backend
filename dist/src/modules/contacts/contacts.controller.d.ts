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
        originalCount: number;
        duplicatesRemoved: number;
        newCount: number;
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
    exportContacts(req: any, search?: string, status?: string, tag?: string, startDate?: string, endDate?: string): Promise<any[]>;
    getTagsAnalytics(req: any, includeSystem?: string): Promise<{
        name: string;
        count: number;
    }[]>;
    findOne(req: any, id: string): Promise<{
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
    uploadAvatar(req: any, id: string, file: any): Promise<{
        avatarUrl: string;
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
        contactIds?: string[];
        tag?: string;
        untagged?: boolean;
    }): Promise<{
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
}
