import { PrismaService } from '../prisma/prisma.service';
export declare class MetaCommerceService {
    private readonly prisma;
    private readonly logger;
    private get appId();
    private get appSecret();
    private get redirectUri();
    private readonly graphApiVersion;
    constructor(prisma: PrismaService);
    generateOAuthUrl(): {
        url: string;
    };
    handleOAuthCallback(code: string, organizationId: string): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        accessToken: string;
        businessId: string | null;
        catalogId: string | null;
    }>;
    getBusinesses(organizationId: string): Promise<any>;
    getCatalogs(businessId: string, organizationId: string): Promise<any>;
    getProducts(catalogId: string, organizationId: string): Promise<any>;
    updateCatalogSettings(metaCatalogId: string, organizationId: string, data: any): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metaCatalogId: string;
        isPublic: boolean;
        settings: import("@prisma/client/runtime/library").JsonValue;
        messageTemplates: import("@prisma/client/runtime/library").JsonValue;
    }>;
    getCheckoutSession(id: string): Promise<{
        order: {
            id: string;
            organizationId: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            catalogId: string;
            orderUniqueId: string | null;
            buyerPhone: string | null;
            buyerName: string | null;
            amount: number | null;
            currency: string | null;
            shippingAddress: import("@prisma/client/runtime/library").JsonValue;
            reminderSentAt: Date | null;
        };
        additionalInfo: any;
    }>;
    applyCoupon(id: string, code: string): Promise<{
        order: {
            id: string;
            organizationId: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            catalogId: string;
            orderUniqueId: string | null;
            buyerPhone: string | null;
            buyerName: string | null;
            amount: number | null;
            currency: string | null;
            shippingAddress: import("@prisma/client/runtime/library").JsonValue;
            reminderSentAt: Date | null;
        };
        discount: number;
    }>;
    disconnectAccount(organizationId: string): Promise<{
        success: boolean;
    }>;
    processIncomingOrder(organizationId: string, whatsappAccountId: string, fromPhone: string, orderData: any): Promise<{
        order: {
            id: string;
            organizationId: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            catalogId: string;
            orderUniqueId: string | null;
            buyerPhone: string | null;
            buyerName: string | null;
            amount: number | null;
            currency: string | null;
            shippingAddress: import("@prisma/client/runtime/library").JsonValue;
            reminderSentAt: Date | null;
        };
        checkoutLink: string;
        totalAmount: number;
        currency: any;
    }>;
}
