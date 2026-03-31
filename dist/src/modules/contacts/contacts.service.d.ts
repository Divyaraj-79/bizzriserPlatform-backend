import { PrismaService } from '../../prisma/prisma.service';
export declare class ContactsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createOrUpdate(orgId: string, phone: string, data: any): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.ContactStatus;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        organizationId: string;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
        whatsappId: string | null;
        phone: string;
        tags: string[];
        customFields: import("@prisma/client/runtime/library").JsonValue;
        optedInAt: Date | null;
        optedOutAt: Date | null;
        lastContactedAt: Date | null;
    }>;
}
