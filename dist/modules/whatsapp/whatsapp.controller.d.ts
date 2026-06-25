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
    listAccounts(req: any): Promise<any>;
    getTemplates(req: any, id: string, sync?: string): Promise<any>;
    createTemplate(req: any, id: string, data: any): Promise<any>;
    uploadTemplateMedia(req: any, id: string, file: any): Promise<{
        handle: any;
    } | undefined>;
    uploadMedia(req: any, id: string, file: any): Promise<{
        id: string;
        url: string;
        filename: string;
    }>;
    updateTemplate(req: any, id: string, templateId: string, data: any): Promise<any>;
    deleteTemplate(req: any, id: string, templateName: string): Promise<{
        success: boolean;
        message: string;
        metaData: any;
    } | undefined>;
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
    } | undefined>;
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
