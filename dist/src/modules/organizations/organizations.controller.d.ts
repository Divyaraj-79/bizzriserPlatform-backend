import { OrganizationsService } from './organizations.service';
export declare class OrganizationsController {
    private readonly orgsService;
    constructor(orgsService: OrganizationsService);
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
        metadata: import("@prisma/client/runtime/library").JsonValue;
    })[]>;
    onboard(orgData: {
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
            lastLoginAt: Date | null;
            refreshToken: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    findOne(req: any): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
    }>;
}
