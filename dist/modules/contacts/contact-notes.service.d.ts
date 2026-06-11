import { PrismaService } from '../../prisma/prisma.service';
export declare class ContactNotesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(orgId: string, contactId: string): Promise<({
        author: {
            id: string;
            firstName: string;
            lastName: string;
            avatarUrl: string | null;
        };
    } & {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        contactId: string;
        body: string;
    })[]>;
    create(orgId: string, contactId: string, userId: string, body: string): Promise<{
        author: {
            id: string;
            firstName: string;
            lastName: string;
            avatarUrl: string | null;
        };
    } & {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        contactId: string;
        body: string;
    }>;
    update(orgId: string, noteId: string, body: string): Promise<{
        author: {
            id: string;
            firstName: string;
            lastName: string;
            avatarUrl: string | null;
        };
    } & {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        contactId: string;
        body: string;
    }>;
    remove(orgId: string, noteId: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        contactId: string;
        body: string;
    }>;
}
