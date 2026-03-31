import { WhatsappService } from './whatsapp.service';
export declare class WhatsappController {
    private readonly whatsappService;
    constructor(whatsappService: WhatsappService);
    connectAccount(req: any, data: any): Promise<{
        id: string;
        phoneNumber: string;
        phoneNumberId: string;
        verifyToken: string;
        organizationId: string;
        displayName: string;
        wabaId: string;
        accessToken: string;
        webhookSecret: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listAccounts(req: any): Promise<{
        id: string;
        phoneNumber: string;
        phoneNumberId: string;
        displayName: string;
        wabaId: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }[]>;
    getTemplates(req: any, id: string): Promise<any>;
    syncAccount(req: any, id: string): Promise<{
        id: string;
        phoneNumber: string;
        phoneNumberId: string;
        verifyToken: string;
        organizationId: string;
        displayName: string;
        wabaId: string;
        accessToken: string;
        webhookSecret: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
    disconnectAccount(req: any, id: string): Promise<{
        id: string;
        phoneNumber: string;
        phoneNumberId: string;
        verifyToken: string;
        organizationId: string;
        displayName: string;
        wabaId: string;
        accessToken: string;
        webhookSecret: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getSignupConfig(): Promise<{
        appId: string | undefined;
        apiVersion: string;
    }>;
}
