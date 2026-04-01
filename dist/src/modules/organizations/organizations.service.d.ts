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
            status: import(".prisma/client").$Enums.OrganizationStatus;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            slug: string;
            logoUrl: string | null;
            website: string | null;
            timezone: string;
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
            lastLoginAt: Date | null;
            refreshToken: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    findById(id: string): Promise<Organization>;
    findAll(): Promise<({
        _count: {
            users: number;
        };
    } & {
        id: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        metadata: Prisma.JsonValue;
    })[]>;
    findOne(id: string): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        metadata: Prisma.JsonValue;
    }>;
}
