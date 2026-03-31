import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/services/security.service';
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
    }): Promise<{
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
    sendTextMessage(orgId: string, accountId: string, to: string, message: string): Promise<any>;
    sendTemplateMessage(orgId: string, accountId: string, to: string, templateName: string, languageCode?: string, components?: any[]): Promise<any>;
    listAccounts(orgId: string): Promise<{
        id: string;
        phoneNumber: string;
        phoneNumberId: string;
        displayName: string;
        wabaId: string;
        status: import(".prisma/client").$Enums.WhatsAppAccountStatus;
        businessProfile: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }[]>;
    getTemplates(orgId: string, accountId: string): Promise<any>;
    syncAccount(orgId: string, accountId: string): Promise<{
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
    disconnectAccount(orgId: string, accountId: string): Promise<{
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
    private getValidToken;
    private handleError;
}
