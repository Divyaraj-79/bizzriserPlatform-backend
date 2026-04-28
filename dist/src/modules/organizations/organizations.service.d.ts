import { PrismaService } from '../../prisma/prisma.service';
import { Organization, Prisma } from '@prisma/client';
export declare class OrganizationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: Prisma.OrganizationCreateInput): Promise<Organization>;
    createWithAdmin(orgData: any, adminData: {
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
            metadata: Prisma.JsonValue;
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
            permissions: Prisma.JsonValue;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    findById(id: string): Promise<Organization>;
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
        metadata: Prisma.JsonValue;
    })[]>;
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
        metadata: Prisma.JsonValue;
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
        metadata: Prisma.JsonValue;
    }>;
    findOne(id: string): Promise<({
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
            permissions: Prisma.JsonValue;
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
        metadata: Prisma.JsonValue;
    }) | null>;
}
