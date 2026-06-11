import { PrismaService } from '../../prisma/prisma.service';
export declare class CustomFieldsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(organizationId: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        type: string;
        isRequired: boolean;
    }[]>;
    create(organizationId: string, data: {
        name: string;
        type?: string;
        isRequired?: boolean;
    }): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        type: string;
        isRequired: boolean;
    }>;
    delete(organizationId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        type: string;
        isRequired: boolean;
    }>;
}
