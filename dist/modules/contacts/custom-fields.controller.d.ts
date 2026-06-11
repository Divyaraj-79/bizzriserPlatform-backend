import { CustomFieldsService } from './custom-fields.service';
export declare class CustomFieldsController {
    private readonly customFieldsService;
    constructor(customFieldsService: CustomFieldsService);
    create(req: any, data: {
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
    findAll(req: any): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        type: string;
        isRequired: boolean;
    }[]>;
    delete(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        type: string;
        isRequired: boolean;
    }>;
}
