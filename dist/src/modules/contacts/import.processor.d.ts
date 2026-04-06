import { OnModuleInit } from '@nestjs/common';
import { ContactsService } from './contacts.service';
export declare class ImportProcessor implements OnModuleInit {
    private readonly contactsService;
    private readonly logger;
    constructor(contactsService: ContactsService);
    onModuleInit(): void;
    handleImport(job: any): Promise<{
        success: boolean;
        count: any;
    }>;
}
