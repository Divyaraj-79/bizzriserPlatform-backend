import { CannedResponsesService } from './canned-responses.service';
export declare class CannedResponsesController {
    private readonly cannedResponsesService;
    constructor(cannedResponsesService: CannedResponsesService);
    findAll(req: any): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        body: string;
        shortcut: string;
    }[]>;
    create(req: any, data: {
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
    update(req: any, id: string, data: {
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
    remove(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        body: string;
        shortcut: string;
    }>;
}
