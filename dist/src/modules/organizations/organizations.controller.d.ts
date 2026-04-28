import { OrganizationsService } from './organizations.service';
export declare class OrganizationsController {
    private readonly orgsService;
    constructor(orgsService: OrganizationsService);
    findAll(): Promise<({
        _count: {
            users: number;
        };
        users: {
            email: string;
            firstName: string;
            lastName: string;
            lastIp: string | null;
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
    onboard(orgData: any, adminData: {
        email: string;
        firstName: string;
        lastName: string;
        password?: string;
    }): Promise<{
        org: {
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
    findOne(req: any): Promise<({
        users: {
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
    }) | null>;
    update(id: string, updateData: any): Promise<{
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
}
