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
    private readonly cache;
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
    uploadMedia(orgId: string, accountId: string, file: any): Promise<{
        id: string;
        url: string;
        filename: string;
    }>;
    getMediaUrl(orgId: string, accountId: string, mediaId: string): Promise<any>;
    downloadMedia(orgId: string, accountId: string, mediaId: string): Promise<{
        stream: any;
        mimeType: any;
    }>;
    sendMediaMessage(orgId: string, accountId: string, to: string, type: MessageType, mediaId: string, caption?: string): Promise<any>;
    sendMediaByUrl(orgId: string, accountId: string, to: string, mediaType: 'image' | 'video' | 'document' | 'audio', mediaUrl: string, caption?: string, filename?: string): Promise<any>;
    sendInteractiveButtons(orgId: string, accountId: string, to: string, bodyText: string, buttons: Array<{
        id: string;
        title: string;
    }>, headerText?: string, footerText?: string): Promise<any>;
    sendInteractiveMessage(orgId: string, accountId: string, to: string, interactivePayload: any): Promise<any>;
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
    }): Promise<any>;
    getTemplates(orgId: string, accountId: string, forceSync?: boolean): Promise<any>;
    createTemplate(orgId: string, accountId: string, data: any): Promise<any>;
    updateTemplate(orgId: string, accountId: string, templateId: string, data: any): Promise<any>;
    deleteTemplate(orgId: string, accountId: string, templateName: string): Promise<{
        success: boolean;
        message: string;
        metaData: any;
    } | undefined>;
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
    registerPhoneNumber(orgId: string, accountId: string, force?: boolean): Promise<void>;
    sendLocationMessage(orgId: string, accountId: string, to: string, data: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
    }): Promise<any>;
    sendContactMessage(orgId: string, accountId: string, to: string, contacts: any[]): Promise<any>;
    sendCTAButtonMessage(orgId: string, accountId: string, to: string, data: {
        body: string;
        footer?: string;
        header?: string;
        buttonLabel: string;
        url: string;
    }): Promise<any>;
    sendFlowMessage(orgId: string, accountId: string, to: string, data: {
        body: string;
        footer?: string;
        flowId: string;
        flowToken: string;
        flowCta: string;
        flowMode?: 'draft' | 'published';
        screen?: string;
        payload?: any;
    }): Promise<any>;
    sendCarouselMessage(orgId: string, accountId: string, to: string, data: {
        body: string;
        cards: any[];
    }): Promise<any>;
    sendCallRequestMessage(orgId: string, accountId: string, to: string, data: {
        body: string;
        footer?: string;
    }): Promise<any>;
    sendPaymentMessage(orgId: string, accountId: string, to: string, data: {
        body: string;
        footer?: string;
        referenceId: string;
        amount: number;
        currency: string;
        gateway: string;
        configId: string;
        razorpayReceipt?: string;
        razorpayNotes?: any;
    }): Promise<any>;
    searchCatalogProducts(orgId: string, accountId: string, catalogId: string, query: string, searchFields?: string[]): Promise<any>;
    sendProductListMessage(orgId: string, accountId: string, to: string, data: {
        catalogId: string;
        body: string;
        header?: string;
        footer?: string;
        sections: Array<{
            title: string;
            products: string[];
        }>;
    }): Promise<any>;
    private handleError;
}
