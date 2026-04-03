import { WhatsappService } from './whatsapp.service';
export declare class WhatsappController {
    private readonly whatsappService;
    constructor(whatsappService: WhatsappService);
    connectAccount(req: any, data: any): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        updatedAt: Date;
        accessToken: string;
        phoneNumberId: string;
        verifyToken: string;
        displayName: string;
        phoneNumber: string;
        wabaId: string;
        webhookSecret: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        messagingLimitTier: string | null;
        messagingLimitCount: number;
    }>;
    listAccounts(req: any): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        phoneNumberId: string;
        displayName: string;
        phoneNumber: string;
        wabaId: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    getTemplates(req: any, id: string): Promise<any>;
    createTemplate(req: any, id: string, data: any): Promise<any>;
    updateTemplate(req: any, id: string, templateId: string, data: any): Promise<any>;
    deleteTemplate(req: any, id: string, templateName: string): Promise<any>;
    syncAccount(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        updatedAt: Date;
        accessToken: string;
        phoneNumberId: string;
        verifyToken: string;
        displayName: string;
        phoneNumber: string;
        wabaId: string;
        webhookSecret: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        messagingLimitTier: string | null;
        messagingLimitCount: number;
    }>;
    disconnectAccount(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        updatedAt: Date;
        accessToken: string;
        phoneNumberId: string;
        verifyToken: string;
        displayName: string;
        phoneNumber: string;
        wabaId: string;
        webhookSecret: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        messagingLimitTier: string | null;
        messagingLimitCount: number;
    }>;
    getSignupConfig(): Promise<{
        appId: string | undefined;
        apiVersion: string;
    }>;
}
