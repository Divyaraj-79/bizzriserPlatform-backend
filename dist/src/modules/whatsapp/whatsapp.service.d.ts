import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/services/security.service';
import { MessageType } from '@prisma/client';
export declare class WhatsappService {
    private readonly configService;
    private readonly prisma;
    private readonly securityService;
    private readonly logger;
    private readonly apiVersion;
    private readonly graphBaseUrl;
    private readonly http;
    constructor(configService: ConfigService, prisma: PrismaService, securityService: SecurityService);
    connectAccount(orgId: string, data: {
        code?: string;
        accessToken?: string;
        wabaId?: string;
        phoneNumberId?: string;
    }): Promise<{
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
    sendTextMessage(orgId: string, accountId: string, to: string, message: string): Promise<any>;
    sendTemplateMessage(orgId: string, accountId: string, to: string, templateName: string, languageCode?: string, components?: any[]): Promise<any>;
    uploadTemplateMedia(orgId: string, accountId: string, file: any): Promise<{
        handle: any;
    } | undefined>;
    uploadMedia(orgId: string, accountId: string, file: any): Promise<any>;
    sendMediaMessage(orgId: string, accountId: string, to: string, type: MessageType, mediaId: string, caption?: string): Promise<any>;
    sendMediaByUrl(orgId: string, accountId: string, to: string, mediaType: 'image' | 'video' | 'document' | 'audio', mediaUrl: string, caption?: string, filename?: string): Promise<any>;
    sendInteractiveButtons(orgId: string, accountId: string, to: string, bodyText: string, buttons: Array<{
        id: string;
        title: string;
    }>, headerText?: string, footerText?: string): Promise<any>;
    sendInteractiveList(orgId: string, accountId: string, to: string, bodyText: string, buttonText: string, sections: Array<{
        title: string;
        rows: Array<{
            id: string;
            title: string;
            description?: string;
        }>;
    }>, headerText?: string, footerText?: string): Promise<any>;
    listAccounts(orgId: string, user: {
        role: string;
        sub: string;
    }): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        createdAt: Date;
        phoneNumberId: string;
        displayName: string;
        phoneNumber: string;
        wabaId: string;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    getTemplates(orgId: string, accountId: string, forceSync?: boolean): Promise<{
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
    createTemplate(orgId: string, accountId: string, data: any): Promise<any>;
    updateTemplate(orgId: string, accountId: string, templateId: string, data: any): Promise<any>;
    deleteTemplate(orgId: string, accountId: string, templateName: string): Promise<any>;
    syncAccount(orgId: string, accountId: string): Promise<{
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
    disconnectAccount(orgId: string, accountId: string): Promise<{
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
    private getValidToken;
    private handleError;
}
