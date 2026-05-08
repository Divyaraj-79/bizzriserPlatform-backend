import { ContactNotesService } from './contact-notes.service';
export declare class ContactNotesController {
    private readonly contactNotesService;
    constructor(contactNotesService: ContactNotesService);
    findAll(req: any, contactId: string): Promise<({
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
    create(req: any, contactId: string, body: string): Promise<{
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
    update(req: any, noteId: string, body: string): Promise<{
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
    remove(req: any, noteId: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        contactId: string;
        body: string;
    }>;
}
