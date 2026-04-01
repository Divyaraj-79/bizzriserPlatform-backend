import { PrismaService } from '../../prisma/prisma.service';
export declare class ContactsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
        whatsappId: string | null;
        phone: string;
        tags: string[];
        customFields: import("@prisma/client/runtime/library").JsonValue;
        optedInAt: Date | null;
        optedOutAt: Date | null;
        lastContactedAt: Date | null;
    }>;
}
