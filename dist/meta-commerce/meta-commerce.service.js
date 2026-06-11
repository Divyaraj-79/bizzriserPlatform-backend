"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MetaCommerceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaCommerceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
let MetaCommerceService = MetaCommerceService_1 = class MetaCommerceService {
    prisma;
    logger = new common_1.Logger(MetaCommerceService_1.name);
    get appId() { return process.env.META_APP_ID; }
    get appSecret() { return process.env.META_APP_SECRET; }
    get redirectUri() { return process.env.META_OAUTH_REDIRECT_URI || 'http://localhost:3000/commerce/meta-setup'; }
    graphApiVersion = 'v19.0';
    constructor(prisma) {
        this.prisma = prisma;
    }
    generateOAuthUrl() {
        const scopes = ['catalog_management', 'business_management'];
        const url = `https://www.facebook.com/${this.graphApiVersion}/dialog/oauth?client_id=${this.appId}&redirect_uri=${this.redirectUri}&scope=${scopes.join(',')}&state=bizzriser&auth_type=rerequest`;
        return { url };
    }
    async handleOAuthCallback(code, organizationId) {
        try {
            const tokenResponse = await axios_1.default.get(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
                params: {
                    client_id: this.appId,
                    redirect_uri: this.redirectUri,
                    client_secret: this.appSecret,
                    code: code,
                },
            });
            const { access_token } = tokenResponse.data;
            const longLivedResponse = await axios_1.default.get(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: this.appId,
                    client_secret: this.appSecret,
                    fb_exchange_token: access_token,
                }
            });
            const longLivedToken = longLivedResponse.data.access_token;
            const connection = await this.prisma.metaCommerceConnection.upsert({
                where: { organizationId },
                update: { accessToken: longLivedToken },
                create: {
                    organizationId,
                    accessToken: longLivedToken
                }
            });
            return connection;
        }
        catch (error) {
            this.logger.error('OAuth Callback Error:', error.response?.data || error.message);
            throw new common_1.InternalServerErrorException('Failed to handle OAuth callback');
        }
    }
    async getBusinesses(organizationId) {
        const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
        if (!connection)
            throw new Error('Meta account not connected');
        try {
            const response = await axios_1.default.get(`https://graph.facebook.com/${this.graphApiVersion}/me/businesses`, {
                params: { access_token: connection.accessToken },
            });
            return response.data.data;
        }
        catch (error) {
            const fbError = error.response?.data?.error?.message || error.message;
            this.logger.error('Fetch Businesses Error:', fbError);
            throw new common_1.InternalServerErrorException(`Failed to fetch businesses: ${fbError}`);
        }
    }
    async getCatalogs(businessId, organizationId) {
        const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
        if (!connection)
            throw new Error('Meta account not connected');
        try {
            try {
                const response = await axios_1.default.get(`https://graph.facebook.com/${this.graphApiVersion}/${businessId}/owned_product_catalogs`, {
                    params: { access_token: connection.accessToken },
                });
                return response.data.data;
            }
            catch (ownedError) {
                this.logger.warn('Failed to fetch owned catalogs, falling back to client catalogs...', ownedError.response?.data?.error?.message);
                const response = await axios_1.default.get(`https://graph.facebook.com/${this.graphApiVersion}/${businessId}/client_product_catalogs`, {
                    params: { access_token: connection.accessToken },
                });
                return response.data.data;
            }
        }
        catch (error) {
            const fbError = error.response?.data?.error?.message || error.message;
            this.logger.error('Fetch Catalogs Error:', fbError);
            throw new common_1.InternalServerErrorException(`Failed to fetch catalogs: ${fbError}`);
        }
    }
    async getProducts(catalogId, organizationId) {
        const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
        if (!connection)
            throw new Error('Meta account not connected');
        try {
            const response = await axios_1.default.get(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/products`, {
                params: {
                    access_token: connection.accessToken,
                    fields: 'id,name,description,price,currency,image_url,availability,retailer_id,product_group'
                },
            });
            return response.data.data;
        }
        catch (error) {
            const fbError = error.response?.data?.error?.message || error.message;
            this.logger.error('Fetch Products Error:', fbError);
            throw new common_1.InternalServerErrorException(`Failed to fetch products: ${fbError}`);
        }
    }
    async updateCatalogSettings(metaCatalogId, organizationId, data) {
        const catalog = await this.prisma.metaCatalog.findFirst({
            where: { metaCatalogId, organizationId }
        });
        if (catalog) {
            return this.prisma.metaCatalog.update({
                where: { id: catalog.id },
                data: {
                    settings: { ...(catalog.settings || {}), ...data }
                }
            });
        }
        else {
            return this.prisma.metaCatalog.create({
                data: {
                    organizationId,
                    metaCatalogId,
                    name: 'Meta Catalog',
                    settings: data
                }
            });
        }
    }
    async getCheckoutSession(id) {
        const order = await this.prisma.catalogOrder.findUnique({
            where: { id }
        });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        return { order, additionalInfo: JSON.parse(order.metadata || '{}') };
    }
    async applyCoupon(id, code) {
        const order = await this.prisma.catalogOrder.findUnique({
            where: { id }
        });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        const coupon = await this.prisma.catalogCoupon.findFirst({
            where: { code, catalogId: order.catalogId, organizationId: order.organizationId, isActive: true }
        });
        if (!coupon)
            throw new common_1.NotFoundException('Invalid or expired coupon');
        const additionalInfo = JSON.parse(order.metadata || '{}');
        const subtotal = additionalInfo.subtotal || 0;
        let discount = 0;
        if (coupon.type === 'PERCENTAGE') {
            discount = (subtotal * coupon.value) / 100;
        }
        else {
            discount = coupon.value;
        }
        const newAmount = Math.max(0, (order.amount || 0) - discount);
        const updatedOrder = await this.prisma.catalogOrder.update({
            where: { id },
            data: {
                amount: newAmount,
                metadata: {
                    ...additionalInfo,
                    couponCode: code,
                    discountAmount: discount
                }
            }
        });
        return { order: updatedOrder, discount };
    }
    async disconnectAccount(organizationId) {
        try {
            await this.prisma.metaCommerceConnection.delete({
                where: { organizationId },
            });
            return { success: true };
        }
        catch (error) {
            return { success: true };
        }
    }
    async processIncomingOrder(organizationId, whatsappAccountId, fromPhone, orderData) {
        const catalogId = orderData.catalog_id;
        const catalog = await this.prisma.metaCatalog.findFirst({
            where: { metaCatalogId: catalogId, organizationId }
        });
        if (!catalog)
            throw new Error('Catalog not found for this order');
        let subtotal = 0;
        const items = orderData.product_items || [];
        for (const item of items) {
            subtotal += parseFloat(item.item_price || '0') * parseInt(item.quantity || '0');
        }
        const currency = items.length > 0 ? items[0].currency : 'USD';
        const settings = catalog.settings || {};
        const cartSettings = settings.cartSettings || {};
        const taxPercent = parseFloat(cartSettings.taxPercent || '0');
        const shippingCharge = parseFloat(cartSettings.shippingCharge || '0');
        const freeShippingThreshold = parseFloat(cartSettings.freeShippingThreshold || '0');
        const serviceFee = parseFloat(cartSettings.serviceFee || '0');
        let finalShipping = shippingCharge;
        if (freeShippingThreshold > 0 && subtotal >= freeShippingThreshold) {
            finalShipping = 0;
        }
        const taxAmount = (subtotal * taxPercent) / 100;
        const totalAmount = subtotal + taxAmount + finalShipping + serviceFee;
        const currentInvoiceId = parseInt(cartSettings.nextInvoiceId || '1');
        const orderUniqueId = `INV-${currentInvoiceId.toString().padStart(5, '0')}`;
        const newCartSettings = { ...cartSettings, nextInvoiceId: currentInvoiceId + 1 };
        await this.updateCatalogSettings(catalog.metaCatalogId, organizationId, { cartSettings: newCartSettings });
        const newOrder = await this.prisma.catalogOrder.create({
            data: {
                organizationId,
                catalogId: catalog.metaCatalogId,
                orderUniqueId,
                buyerPhone: fromPhone,
                buyerName: 'WhatsApp Customer',
                amount: totalAmount,
                currency,
                status: 'PENDING',
                metadata: {
                    subtotal,
                    taxAmount,
                    shippingCharge: finalShipping,
                    serviceFee,
                    items
                }
            }
        });
        const checkoutLink = `https://bizzriser.com/checkout/${newOrder.id}`;
        return { order: newOrder, checkoutLink, totalAmount, currency };
    }
};
exports.MetaCommerceService = MetaCommerceService;
exports.MetaCommerceService = MetaCommerceService = MetaCommerceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MetaCommerceService);
//# sourceMappingURL=meta-commerce.service.js.map