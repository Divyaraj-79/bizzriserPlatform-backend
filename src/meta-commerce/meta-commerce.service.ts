import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class MetaCommerceService {
  private readonly logger = new Logger(MetaCommerceService.name);
  private get appId() { return process.env.META_APP_ID; }
  private get appSecret() { return process.env.META_APP_SECRET; }
  private get redirectUri() { return process.env.META_OAUTH_REDIRECT_URI || 'http://localhost:3000/commerce/meta-setup'; }
  private readonly graphApiVersion = 'v19.0';

  constructor(private readonly prisma: PrismaService) {}

  generateOAuthUrl() {
    const scopes = ['catalog_management', 'business_management'];
    const url = `https://www.facebook.com/${this.graphApiVersion}/dialog/oauth?client_id=${this.appId}&redirect_uri=${this.redirectUri}&scope=${scopes.join(',')}&state=bizzriser&auth_type=rerequest`;
    return { url };
  }

  async handleOAuthCallback(code: string, organizationId: string) {
    try {
      // 1. Exchange code for short-lived token
      const tokenResponse = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
        params: {
          client_id: this.appId,
          redirect_uri: this.redirectUri,
          client_secret: this.appSecret,
          code: code,
        },
      });
      const { access_token } = tokenResponse.data;

      // 2. Exchange for long-lived token
      const longLivedResponse = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: access_token,
        }
      });
      const longLivedToken = longLivedResponse.data.access_token;

      // 3. Save to database
      const connection = await this.prisma.metaCommerceConnection.upsert({
        where: { organizationId },
        update: { accessToken: longLivedToken },
        create: {
          organizationId,
          accessToken: longLivedToken
        }
      });
      return connection;
    } catch (error: any) {
      this.logger.error('OAuth Callback Error:', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to handle OAuth callback');
    }
  }

  async getBusinesses(organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const response = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/me/businesses`, {
        params: { access_token: connection.accessToken },
      });
      return response.data.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Fetch Businesses Error:', fbError);
      throw new InternalServerErrorException(`Failed to fetch businesses: ${fbError}`);
    }
  }

  async getCatalogs(organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const bRes = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/me/businesses`, {
        params: { 
          access_token: connection.accessToken,
          fields: 'id,name,owned_product_catalogs,client_product_catalogs'
        },
      });
      const businesses = bRes.data.data;
      
      let allCatalogs: any[] = [];
      
      for (const b of businesses) {
        if (b.owned_product_catalogs?.data) {
          allCatalogs.push(...b.owned_product_catalogs.data);
        }
        if (b.client_product_catalogs?.data) {
          allCatalogs.push(...b.client_product_catalogs.data);
        }
      }
      
      return allCatalogs;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Fetch Catalogs Error:', fbError);
      throw new InternalServerErrorException(`Failed to fetch catalogs: ${fbError}`);
    }
  }

  async fetchProductsFromMeta(catalogId: string, organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const response = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/products`, {
        params: { 
          access_token: connection.accessToken,
          fields: 'id,name,description,price,currency,image_url,availability,retailer_id,product_group,brand,condition,link'
        },
      });
      return response.data.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Fetch Products from Meta Error:', fbError);
      throw new InternalServerErrorException(`Failed to fetch products from Meta: ${fbError}`);
    }
  }

  async getProducts(catalogId: string, organizationId: string) {
    try {
      const products = await this.prisma.metaProduct.findMany({
        where: {
          metaCatalogId: catalogId,
          organizationId: organizationId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      return products;
    } catch (error: any) {
      this.logger.error('Fetch Local Products Error:', error.message);
      throw new InternalServerErrorException(`Failed to fetch local products: ${error.message}`);
    }
  }

  async getStatus(organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({
      where: { organizationId }
    });
    return { connected: !!connection, connection };
  }

  async addProduct(catalogId: string, organizationId: string, data: any) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const payload = {
        item_type: 'PRODUCT_ITEM',
        requests: [
          {
            method: 'CREATE',
            data: data
          }
        ]
      };
      
      const response = await axios.post(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/items_batch`, payload, {
        params: { access_token: connection.accessToken },
      });
      
      const validationStatus = response.data?.validation_status?.[0];
      if (validationStatus?.errors?.length > 0) {
        throw new Error(`Meta Validation Error: ${validationStatus.errors[0].message}`);
      }
      
      await this.prisma.metaProduct.create({
        data: {
          organizationId,
          metaCatalogId: catalogId,
          retailerId: data.id,
          name: data.title || 'Unnamed Product',
          description: data.description,
          price: data.price,
          image_url: data.image_link,
          url: data.link,
          brand: data.brand,
          availability: data.availability,
          condition: data.condition,
        }
      });
      
      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Add Product Error:', fbError);
      throw new InternalServerErrorException(`Failed to add product: ${fbError}`);
    }
  }

  async updateProduct(catalogId: string, organizationId: string, retailerId: string, data: any) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const payload = {
        item_type: 'PRODUCT_ITEM',
        requests: [
          {
            method: 'UPDATE',
            retailer_id: retailerId,
            data: data 
          }
        ]
      };
      
      const response = await axios.post(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/items_batch`, payload, {
        params: { access_token: connection.accessToken },
      });
      
      const validationStatus = response.data?.validation_status?.[0];
      if (validationStatus?.errors?.length > 0) {
        throw new Error(`Meta Validation Error: ${validationStatus.errors[0].message}`);
      }
      
      await this.prisma.metaProduct.updateMany({
        where: {
          metaCatalogId: catalogId,
          retailerId: retailerId,
          organizationId: organizationId
        },
        data: {
          name: data.title,
          description: data.description,
          price: data.price,
          image_url: data.image_link,
          url: data.link,
          brand: data.brand,
          availability: data.availability,
          condition: data.condition,
        }
      });
      
      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Update Product Error:', fbError);
      throw new InternalServerErrorException(`Failed to update product: ${fbError}`);
    }
  }

  async deleteProduct(catalogId: string, organizationId: string, retailerId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const payload = {
        item_type: 'PRODUCT_ITEM',
        requests: [
          {
            method: 'DELETE',
            retailer_id: retailerId,
          }
        ]
      };
      
      const response = await axios.post(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/items_batch`, payload, {
        params: { access_token: connection.accessToken },
      });
      
      const validationStatus = response.data?.validation_status?.[0];
      if (validationStatus?.errors?.length > 0) {
        throw new Error(`Meta Validation Error: ${validationStatus.errors[0].message}`);
      }
      
      await this.prisma.metaProduct.deleteMany({
        where: {
          metaCatalogId: catalogId,
          retailerId: retailerId,
          organizationId: organizationId
        }
      });
      
      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Delete Product Error:', fbError);
      throw new InternalServerErrorException(`Failed to delete product: ${fbError}`);
    }
  }

  async syncCatalog(catalogId: string, organizationId: string) {
    const products = await this.fetchProductsFromMeta(catalogId, organizationId);
    
    let catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId, metaCatalogId: catalogId }
    });

    if (catalog) {
      await this.prisma.metaCatalog.update({
        where: { id: catalog.id },
        data: {
          productCount: products.length || 0,
          lastSyncedAt: new Date()
        }
      });
    } else {
      await this.prisma.metaCatalog.create({
        data: {
          organizationId,
          metaCatalogId: catalogId,
          name: 'Synced Catalog',
          productCount: products.length || 0,
          lastSyncedAt: new Date()
        }
      });
    }
    
    const metaIds = [];
    
    for (const product of products) {
      const retailerId = String(product.retailer_id || product.id);
      metaIds.push(retailerId);
      
      const cat = product.category || product.product_group;
      const categoryStr = cat ? (typeof cat === 'object' ? (cat.name || JSON.stringify(cat)) : String(cat)) : null;
      
      await this.prisma.metaProduct.upsert({
        where: {
          organizationId_metaCatalogId_retailerId: {
            organizationId: organizationId,
            metaCatalogId: catalogId,
            retailerId: retailerId
          }
        },
        update: {
          metaId: product.id,
          name: product.name,
          description: product.description,
          price: String(product.price || ''),
          currency: product.currency,
          image_url: product.image_url,
          url: product.link || product.url,
          brand: product.brand,
          availability: product.availability,
          condition: product.condition,
          category: categoryStr,
        },
        create: {
          organizationId: organizationId,
          metaCatalogId: catalogId,
          metaId: product.id,
          retailerId: retailerId,
          name: product.name || 'Unnamed Product',
          description: product.description,
          price: String(product.price || ''),
          currency: product.currency,
          image_url: product.image_url,
          url: product.link || product.url,
          brand: product.brand,
          availability: product.availability,
          condition: product.condition,
          category: categoryStr,
        }
      });
    }

    if (metaIds.length > 0) {
      await this.prisma.metaProduct.deleteMany({
        where: {
          metaCatalogId: catalogId,
          organizationId: organizationId,
          retailerId: { notIn: metaIds }
        }
      });
    } else {
      await this.prisma.metaProduct.deleteMany({
        where: {
          metaCatalogId: catalogId,
          organizationId: organizationId,
        }
      });
    }
    
    return { success: true, count: products.length };
  }

  async getOrders(organizationId: string) {
    return this.prisma.catalogOrder.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateOrderStatus(orderId: string, status: string, organizationId: string) {
    const order = await this.prisma.catalogOrder.findFirst({
      where: { id: orderId, organizationId }
    });
    if (!order) throw new NotFoundException('Order not found');
    
    return this.prisma.catalogOrder.update({
      where: { id: orderId },
      data: { status }
    });
  }

  async getCoupons(catalogId: string, organizationId: string) {
    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { metaCatalogId: catalogId, organizationId }
    });
    if (!catalog) return [];
    
    return this.prisma.catalogCoupon.findMany({
      where: { catalogId: catalog.id, organizationId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createCoupon(catalogId: string, organizationId: string, data: any) {
    let catalog = await this.prisma.metaCatalog.findFirst({
      where: { metaCatalogId: catalogId, organizationId }
    });
    
    if (!catalog) {
       catalog = await this.prisma.metaCatalog.create({
         data: {
           organizationId,
           metaCatalogId: catalogId,
           name: 'Catalog ' + catalogId
         }
       });
    }

    return this.prisma.catalogCoupon.create({
      data: {
        organizationId,
        catalogId: catalog.id,
        code: data.code,
        type: data.type || 'PERCENTAGE',
        value: parseFloat(data.value),
        isActive: data.isActive !== undefined ? data.isActive : true,
        maxUses: data.usageLimit ? parseInt(data.usageLimit) : 0,
        validTo: data.expiresAt ? new Date(data.expiresAt) : null,
      }
    });
  }

  async deleteCoupon(couponId: string, organizationId: string) {
    return this.prisma.catalogCoupon.deleteMany({
      where: { id: couponId, organizationId }
    });
  }

  async updateCatalogSettings(metaCatalogId: string, organizationId: string, data: any) {
    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { metaCatalogId, organizationId }
    });
    if (catalog) {
      return this.prisma.metaCatalog.update({
        where: { id: catalog.id },
        data: {
          settings: { ...(catalog.settings as any || {}), ...data }
        }
      });
    } else {
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

  async getCheckoutSession(id: string) {
    const order = await this.prisma.catalogOrder.findUnique({
      where: { id }
    });
    if (!order) throw new NotFoundException('Order not found');
    return { order, additionalInfo: JSON.parse(order.metadata as string || '{}') };
  }

  async applyCoupon(id: string, code: string) {
    const order = await this.prisma.catalogOrder.findUnique({
      where: { id }
    });
    if (!order) throw new NotFoundException('Order not found');

    const coupon = await this.prisma.catalogCoupon.findFirst({
      where: { code, catalogId: order.catalogId, organizationId: order.organizationId, isActive: true }
    });
    if (!coupon) throw new NotFoundException('Invalid or expired coupon');

    const additionalInfo = JSON.parse(order.metadata as string || '{}');
    const subtotal = additionalInfo.subtotal || 0;
    
    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = (subtotal * coupon.value) / 100;
    } else {
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

  async disconnectAccount(organizationId: string) {
    try {
      await this.prisma.metaCommerceConnection.delete({
        where: { organizationId },
      });
      return { success: true };
    } catch (error) {
      return { success: true };
    }
  }

  async processIncomingOrder(organizationId: string, whatsappAccountId: string, fromPhone: string, orderData: any) {
    const catalogId = orderData.catalog_id;
    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { metaCatalogId: catalogId, organizationId }
    });
    if (!catalog) throw new Error('Catalog not found for this order');

    let subtotal = 0;
    const items = orderData.product_items || [];
    for (const item of items) {
      subtotal += parseFloat(item.item_price || '0') * parseInt(item.quantity || '0');
    }
    
    const currency = items.length > 0 ? items[0].currency : 'USD';

    const settings: any = catalog.settings || {};
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
    const orderUniqueId = `INV-${currentInvoiceId.toString().padStart(5, '0')}` ;
    
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
}