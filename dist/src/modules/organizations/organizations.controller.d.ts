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
        slug: string;
        name: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
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
            slug: string;
            name: string;
            logoUrl: string | null;
            website: string | null;
            timezone: string;
            status: import(".prisma/client").$Enums.OrganizationStatus;
            metadata: import("@prisma/client/runtime/library").JsonValue;
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
    findOne(req: any): Promise<{
        id: string;
        slug: string;
        name: string;
        logoUrl: string | null;
        website: string | null;
        timezone: string;
        status: import(".prisma/client").$Enums.OrganizationStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
