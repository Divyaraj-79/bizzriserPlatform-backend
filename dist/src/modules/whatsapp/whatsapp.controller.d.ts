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
        messagingLimitTier: string | null;
        messagingLimitCount: number;
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
        messagingLimitTier: string | null;
        messagingLimitCount: number;
        createdAt: Date;
        updatedAt: Date;
    } | undefined>;
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
        messagingLimitTier: string | null;
        messagingLimitCount: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getSignupConfig(): Promise<{
        appId: string | undefined;
        apiVersion: string;
    }>;
}
