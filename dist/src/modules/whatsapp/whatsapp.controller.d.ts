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
        displayName: string;
        phoneNumber: string;
        phoneNumberId: string;
        wabaId: string;
        accessToken: string;
        verifyToken: string;
        webhookSecret: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        messagingLimitTier: string | null;
        messagingLimitCount: number;
    }>;
    listAccounts(req: any): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        displayName: string;
        phoneNumber: string;
        phoneNumberId: string;
        wabaId: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    getTemplates(req: any, id: string, sync?: string): Promise<{
        id: string;
        organizationId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        accountId: string;
        language: string;
        category: string;
        components: import("@prisma/client/runtime/library").JsonValue;
        variableMapping: import("@prisma/client/runtime/library").JsonValue;
        isActive: boolean;
    }[] | undefined>;
    createTemplate(req: any, id: string, data: any): Promise<any>;
    uploadTemplateMedia(req: any, id: string, file: any): Promise<{
        handle: any;
    } | undefined>;
    updateTemplate(req: any, id: string, templateId: string, data: any): Promise<any>;
    deleteTemplate(req: any, id: string, templateName: string): Promise<any>;
    syncAccount(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        updatedAt: Date;
        displayName: string;
        phoneNumber: string;
        phoneNumberId: string;
        wabaId: string;
        accessToken: string;
        verifyToken: string;
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
        displayName: string;
        phoneNumber: string;
        phoneNumberId: string;
        wabaId: string;
        accessToken: string;
        verifyToken: string;
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
