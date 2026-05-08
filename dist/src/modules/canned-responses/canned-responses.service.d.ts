import { PrismaService } from '../../prisma/prisma.service';
export declare class CannedResponsesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(orgId: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        body: string;
        shortcut: string;
    }[]>;
    create(orgId: string, data: {
        shortcut: string;
        body: string;
    }): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        body: string;
        shortcut: string;
    }>;
    update(orgId: string, id: string, data: {
        shortcut?: string;
        body?: string;
    }): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        body: string;
        shortcut: string;
    }>;
    remove(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        body: string;
        shortcut: string;
    }>;
}
