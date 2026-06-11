import { MetaCommerceService } from './meta-commerce.service';
export declare class MetaCommercePublicController {
    private readonly metaCommerceService;
    constructor(metaCommerceService: MetaCommerceService);
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
}
