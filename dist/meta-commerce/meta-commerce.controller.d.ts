import { MetaCommerceService } from './meta-commerce.service';
export declare class MetaCommerceController {
    private readonly metaCommerceService;
    constructor(metaCommerceService: MetaCommerceService);
    getOAuthUrl(): {
        url: string;
    };
    handleOAuthCallback(code: string, req: any): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        accessToken: string;
        businessId: string | null;
        catalogId: string | null;
    }>;
    getBusinesses(req: any): Promise<any>;
    getCatalogs(businessId: string, req: any): Promise<any>;
    getProducts(catalogId: string, req: any): Promise<any>;
}
