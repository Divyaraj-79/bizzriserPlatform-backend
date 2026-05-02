import { OnModuleInit } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
export declare class ImportProcessor implements OnModuleInit {
    private readonly contactsService;
    private readonly realtimeGateway;
    private readonly logger;
    constructor(contactsService: ContactsService, realtimeGateway: RealtimeGateway);
    onModuleInit(): void;
    handleImport(job: any): Promise<{
        success: boolean;
        count: any;
        duplicatesRemoved: any;
    }>;
}
