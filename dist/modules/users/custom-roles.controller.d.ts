import { CustomRolesService } from './custom-roles.service';
export declare class CustomRolesController {
    private readonly customRolesService;
    constructor(customRolesService: CustomRolesService);
    findAll(req: any): Promise<{
        id: string;
        organizationId: string;
        permissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
    }[]>;
    create(req: any, data: {
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
    remove(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        permissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
    }>;
}
