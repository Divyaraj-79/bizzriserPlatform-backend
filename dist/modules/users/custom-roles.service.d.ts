import { PrismaService } from '../../prisma/prisma.service';
export declare class CustomRolesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(organizationId: string): Promise<{
        id: string;
        organizationId: string;
        permissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
    }[]>;
    create(organizationId: string, data: {
        name: string;
        permissions: any;
    }): Promise<{
        id: string;
        organizationId: string;
        permissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
    }>;
    remove(id: string, organizationId: string): Promise<{
        id: string;
        organizationId: string;
        permissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
    }>;
}
