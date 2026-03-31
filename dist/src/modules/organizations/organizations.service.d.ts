import { PrismaService } from '../../prisma/prisma.service';
import { Organization, Prisma } from '@prisma/client';
export declare class OrganizationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(data: Prisma.OrganizationCreateInput): Promise<Organization>;
    createWithAdmin(orgData: {
        name: string;
        slug: string;
    }, adminData: {
        email: string;
        firstName: string;
        lastName: string;
        password?: string;
    }): Promise<{
        org: {
            id: string;
            slug: string;
            name: string;
            logoUrl: string | null;
            website: string | null;
            timezone: string;
            status: import(".prisma/client").$Enums.OrganizationStatus;
            metadata: Prisma.JsonValue;
            createdAt: Date;
            updatedAt: Date;
        };
        admin: {
            id: string;
            status: import(".prisma/client").$Enums.UserStatus;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            organizationId: string;
            passwordHash: string;
            firstName: string;
            lastName: string;
            role: import(".prisma/client").$Enums.UserRole;
            avatarUrl: string | null;
            lastLoginAt: Date | null;
            refreshToken: string | null;
        };
    }>;
    findById(id: string): Promise<Organization>;
    findAll(): Promise<({
        _count: {
            users: number;
        };
    } & {
        id: string;
        slug: string;
        name: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        metadata: Prisma.JsonValue;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    findOne(id: string): Promise<{
        id: string;
        slug: string;
        name: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        metadata: Prisma.JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
