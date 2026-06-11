import { ClientsService } from './clients.service';
export declare class ClientsController {
    private readonly clientsService;
    constructor(clientsService: ClientsService);
    findAll(): Promise<({
        _count: {
            users: number;
        };
        users: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            lastLoginAt: Date | null;
        }[];
    } & {
        id: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        timezone: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        website: string | null;
        address: string | null;
        whatsappNumber: string | null;
        expiryDate: Date | null;
        package: import(".prisma/client").$Enums.SubscriptionPackage;
        isPhoneVerified: boolean;
        metadata: import("@prisma/client/runtime/library").JsonValue;
    })[]>;
    onboard(data: any): Promise<{
        organization: {
            id: string;
            status: import(".prisma/client").$Enums.OrganizationStatus;
            timezone: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            slug: string;
            logoUrl: string | null;
            website: string | null;
            address: string | null;
            whatsappNumber: string | null;
            expiryDate: Date | null;
            package: import(".prisma/client").$Enums.SubscriptionPackage;
            isPhoneVerified: boolean;
            metadata: import("@prisma/client/runtime/library").JsonValue;
        };
        admin: {
            id: string;
            organizationId: string;
            email: string;
            passwordHash: string;
            firstName: string;
            lastName: string;
            role: import(".prisma/client").$Enums.UserRole;
            status: import(".prisma/client").$Enums.UserStatus;
            avatarUrl: string | null;
            lastIp: string | null;
            lastLoginAt: Date | null;
            refreshToken: string | null;
            timezone: string;
            permissions: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    update(id: string, data: any): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        timezone: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        website: string | null;
        address: string | null;
        whatsappNumber: string | null;
        expiryDate: Date | null;
        package: import(".prisma/client").$Enums.SubscriptionPackage;
        isPhoneVerified: boolean;
        metadata: import("@prisma/client/runtime/library").JsonValue;
    }>;
    delete(id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        timezone: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        website: string | null;
        address: string | null;
        whatsappNumber: string | null;
        expiryDate: Date | null;
        package: import(".prisma/client").$Enums.SubscriptionPackage;
        isPhoneVerified: boolean;
        metadata: import("@prisma/client/runtime/library").JsonValue;
    }>;
    loginAs(id: string, req: any): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
}
