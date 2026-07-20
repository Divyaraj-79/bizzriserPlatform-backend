import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FlowExecutorService } from '../modules/chatbots/executor/flow-executor.service';
import axios from 'axios';

@Injectable()
export class MetaCommerceService {
  private readonly logger = new Logger(MetaCommerceService.name);
  private get appId() { return process.env.META_APP_ID; }
  private get appSecret() { return process.env.META_APP_SECRET; }
  private get redirectUri() { return process.env.META_OAUTH_REDIRECT_URI || 'http://localhost:3000/commerce/meta-setup'; }
  private readonly graphApiVersion = 'v19.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowExecutor: FlowExecutorService,
    private readonly configService: ConfigService
  ) { }

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

  async setActiveBusiness(organizationId: string, businessId: string | null) {
    return this.prisma.metaCommerceConnection.update({
      where: { organizationId },
      data: { businessId }
    });
  }

  async updateSettings(organizationId: string, data: any) {
    const updateData: any = {};
    if (data.outOfStockBehavior !== undefined) {
      updateData.outOfStockBehavior = data.outOfStockBehavior;
    }

    const conn = Object.keys(updateData).length > 0
      ? await this.prisma.metaCommerceConnection.update({
        where: { organizationId },
        data: updateData
      })
      : await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });

    // Removed the global cartSettings and paymentSettings mass-update logic
    // as it is now handled per-catalog via updateCatalogSettings
    return conn;
  }

  async getSettings(organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' }
    });
    const settings = (catalog?.settings as any) || {};

    return {
      outOfStockBehavior: connection?.outOfStockBehavior,
      paymentSettings: settings.paymentSettings || {},
      cartSettings: settings.cartSettings || {}
    };
  }

  async getCartAndPaymentSettings(organizationId: string, catalogId: string) {
    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId, id: catalogId }
    });
    if (!catalog) throw new Error('Catalog not found');
    return catalog.settings || {};
  }

  async updateCartAndPaymentSettings(organizationId: string, catalogId: string, data: any) {
    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId, id: catalogId }
    });
    if (!catalog) throw new Error('Catalog not found');

    const currentSettings = (catalog.settings as any) || {};
    const newSettings = { ...currentSettings };
    if (data.paymentSettings) newSettings.paymentSettings = data.paymentSettings;
    if (data.cartSettings) newSettings.cartSettings = data.cartSettings;

    return this.prisma.metaCatalog.update({
      where: { id: catalog.id },
      data: { settings: newSettings }
    });
  }

  async getCatalogs(organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    if (!connection.businessId) {
      // Return a specific error structure that the frontend can catch
      throw new InternalServerErrorException('BUSINESS_MANAGER_NOT_SELECTED');
    }

    try {
      const bRes = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/${connection.businessId}`, {
        params: {
          access_token: connection.accessToken,
          fields: 'owned_product_catalogs,client_product_catalogs'
        },
      });
      const b = bRes.data;

      let allCatalogs: any[] = [];

      if (b.owned_product_catalogs?.data) {
        allCatalogs.push(...b.owned_product_catalogs.data);
      }
      if (b.client_product_catalogs?.data) {
        allCatalogs.push(...b.client_product_catalogs.data);
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
          fields: 'id,name,description,price,image_url,url,brand,availability,condition,category,retailer_id,additional_image_link',
          limit: 1000
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

  async updateCoupon(couponId: string, organizationId: string, data: any) {
    try {
      const existing = await this.prisma.catalogCoupon.findFirst({
        where: { id: couponId, organizationId }
      });
      if (!existing) throw new Error('Coupon not found');

      const updated = await this.prisma.catalogCoupon.update({
        where: { id: couponId },
        data: {
          code: data.code,
          type: data.type,
          value: data.value,
          minOrder: data.minOrderAmount,
          maxUses: data.maxUses,
          isActive: data.isActive,
          validFrom: data.validFrom ? new Date(data.validFrom) : null,
          validTo: data.validTo ? new Date(data.validTo) : null,
        }
      });
      return { success: true, data: updated };
    } catch (err: any) {
      throw new InternalServerErrorException(`Failed to update coupon: ${err.message}`);
    }
  }

  async getStatus(organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({
      where: { organizationId }
    });
    return { connected: !!connection, connection };
  }

  async getEcommerceStats(organizationId: string) {
    const [totalProducts, totalOrders, activeCoupons] = await Promise.all([
      this.prisma.metaProduct.count({ where: { organizationId } }),
      this.prisma.catalogOrder.count({ where: { organizationId } }),
      this.prisma.catalogCoupon.count({ where: { organizationId, isActive: true } })
    ]);

    return {
      totalProducts,
      totalOrders,
      activeCoupons
    };
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
            data: {
              ...data,
              visibility: data.isHidden !== undefined ? (data.isHidden ? 'staging' : 'published') : undefined
            }
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
          additional_image_urls: data.additional_image_link ? (Array.isArray(data.additional_image_link) ? data.additional_image_link : [data.additional_image_link]) : [],
          url: data.link,
          brand: data.brand,
          availability: data.availability,
          condition: data.condition,
          category: data.category || data.product_group,
          itemGroupId: data.item_group_id,
          inventory: data.inventory !== undefined && data.inventory !== null ? parseInt(data.inventory) : null,
          salePrice: data.sale_price,
          isHidden: data.isHidden || false
        }
      });

      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Add Product Error:', fbError);
      throw new InternalServerErrorException(`Failed to add product: ${fbError}`);
    }
  }

  async bulkAddProducts(catalogId: string, organizationId: string, products: any[]) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    if (!products || products.length === 0) return { success: true };

    try {
      // Split into batches of 50 (Meta's limit for items_batch is usually higher but 50 is safe)
      const batchSize = 50;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const requests = batch.map(data => ({
          method: 'CREATE',
          data: data
        }));

        const payload = {
          item_type: 'PRODUCT_ITEM',
          requests
        };

        const response = await axios.post(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/items_batch`, payload, {
          params: { access_token: connection.accessToken },
        });

        const validationStatus = response.data?.validation_status?.[0];
        if (validationStatus?.errors?.length > 0) {
          throw new Error(`Meta Validation Error: ${validationStatus.errors[0].message}`);
        }

        // Save to DB
        const dbOperations = batch.map(data => {
          return this.prisma.metaProduct.upsert({
            where: {
              organizationId_metaCatalogId_retailerId: {
                organizationId,
                metaCatalogId: catalogId,
                retailerId: data.id
              }
            },
            update: {
              name: data.title || 'Unnamed Product',
              description: data.description,
              price: data.price,
              image_url: data.image_link,
              additional_image_urls: data.additional_image_link ? (Array.isArray(data.additional_image_link) ? data.additional_image_link : [data.additional_image_link]) : [],
              url: data.link,
              brand: data.brand,
              availability: data.availability,
              condition: data.condition,
              category: data.category || data.product_group,
              itemGroupId: data.item_group_id,
              inventory: data.inventory !== undefined && data.inventory !== null ? parseInt(data.inventory) : null,
              salePrice: data.sale_price
            },
            create: {
              organizationId,
              metaCatalogId: catalogId,
              retailerId: data.id,
              name: data.title || 'Unnamed Product',
              description: data.description,
              price: data.price,
              image_url: data.image_link,
              additional_image_urls: data.additional_image_link ? (Array.isArray(data.additional_image_link) ? data.additional_image_link : [data.additional_image_link]) : [],
              url: data.link,
              brand: data.brand,
              availability: data.availability,
              condition: data.condition,
              category: data.category || data.product_group,
              itemGroupId: data.item_group_id,
              inventory: data.inventory !== undefined && data.inventory !== null ? parseInt(data.inventory) : null,
              salePrice: data.sale_price
            }
          });
        });

        await Promise.all(dbOperations);
      }
      return { success: true, count: products.length };
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Bulk Add Products Error:', fbError);
      throw new InternalServerErrorException(`Failed to bulk add products: ${fbError}`);
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
            data: {
              ...data,
              visibility: data.isHidden !== undefined ? (data.isHidden ? 'staging' : 'published') : undefined
            }
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
          category: data.category || data.product_group,
          itemGroupId: data.item_group_id,
          inventory: data.inventory !== undefined && data.inventory !== null ? parseInt(data.inventory) : null,
          salePrice: data.sale_price,
          isHidden: data.isHidden !== undefined ? data.isHidden : undefined
        }
      });

      return response.data;
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Update Product Error:', fbError);
      throw new InternalServerErrorException(`Failed to update product: ${fbError}`);
    }
  }

  async toggleProductVisibility(catalogId: string, organizationId: string, retailerId: string, isHidden: boolean) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const payload = {
        item_type: 'PRODUCT_ITEM',
        requests: [
          {
            method: 'UPDATE',
            retailer_id: retailerId,
            data: { visibility: isHidden ? 'staging' : 'published' }
          }
        ]
      };

      await axios.post(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/items_batch`, payload, {
        params: { access_token: connection.accessToken },
      });

      await this.prisma.metaProduct.updateMany({
        where: {
          metaCatalogId: catalogId,
          retailerId: retailerId,
          organizationId: organizationId
        },
        data: { isHidden }
      });

      return { success: true, isHidden };
    } catch (error: any) {
      const fbError = error.response?.data?.error?.message || error.message;
      this.logger.error('Toggle Product Visibility Error:', fbError);
      throw new InternalServerErrorException(`Failed to toggle visibility: ${fbError}`);
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
            data: { id: retailerId }
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
          itemGroupId: product.item_group_id || null,
          inventory: product.inventory !== undefined && product.inventory !== null ? parseInt(product.inventory) : null,
          salePrice: product.sale_price || null,
          isHidden: product.visibility === 'staging'
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
          itemGroupId: product.item_group_id || null,
          inventory: product.inventory !== undefined && product.inventory !== null ? parseInt(product.inventory) : null,
          salePrice: product.sale_price || null,
          isHidden: product.visibility === 'staging'
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

    const updated = await this.prisma.catalogOrder.update({
      where: { id: orderId },
      data: { status }
    });

    const systemEventMap: Record<string, string> = {
      'APPROVED': 'ORDER_APPROVED',
      'REJECTED': 'ORDER_REJECTED',
      'SHIPPED': 'ORDER_SHIPPED',
      'DELIVERED': 'ORDER_DELIVERED',
      'COMPLETED': 'ORDER_COMPLETED',
      'REFUNDED': 'ORDER_REFUNDED',
    };

    const sysEventStr = systemEventMap[status];
    if (sysEventStr && order.buyerPhone) {
      const systemBot = await this.prisma.chatbot.findFirst({
        where: { organizationId, systemEvent: sysEventStr, status: 'ACTIVE' }
      });
      if (systemBot) {
        const account = await this.prisma.whatsAppAccount.findFirst({
          where: { organizationId }
        });
        const contact = await this.prisma.contact.findFirst({
          where: { organizationId, phone: order.buyerPhone }
        });
        if (account && contact) {
          const initialVars = {
            orderId: order.orderUniqueId,
            currency: order.currency,
            totalAmount: order.amount?.toString() || '0'
          };
          await this.flowExecutor.startSession(
            organizationId, 
            account.id, 
            systemBot, 
            contact, 
            { text: { body: '' } },
            initialVars
          );
        }
      }
    }

    return updated;
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

  // --- Product Sets (Collections) ---

  async getProductSets(catalogId: string, organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const response = await axios.get(`https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/product_sets`, {
        params: { access_token: connection.accessToken, fields: 'id,name,filter,product_count' }
      });
      return response.data.data;
    } catch (error: any) {
      this.logger.error('Get Product Sets Error:', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to fetch product sets');
    }
  }

  async createProductSet(catalogId: string, organizationId: string, name: string, filter: any) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const formData = new URLSearchParams();
      formData.append('name', name);
      formData.append('filter', typeof filter === 'string' ? filter : JSON.stringify(filter));

      const response = await axios.post(
        `https://graph.facebook.com/${this.graphApiVersion}/${catalogId}/product_sets`,
        formData,
        {
          params: { access_token: connection.accessToken },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );
      return response.data;
    } catch (error: any) {
      this.logger.error('Create Product Set Error:', error.response?.data || error.message);
      const errData = error.response?.data?.error || {};
      const metaError = errData.error_user_msg || errData.message;
      throw new InternalServerErrorException(metaError || 'Failed to create product set');
    }
  }

  async deleteProductSet(setId: string, organizationId: string) {
    const connection = await this.prisma.metaCommerceConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new Error('Meta account not connected');

    try {
      const response = await axios.delete(`https://graph.facebook.com/${this.graphApiVersion}/${setId}`, {
        params: { access_token: connection.accessToken }
      });
      return response.data;
    } catch (error: any) {
      this.logger.error('Delete Product Set Error:', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to delete product set');
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
    try {
      const catalogId = orderData.catalog_id;
      const catalog = await this.prisma.metaCatalog.findFirst({
        where: { metaCatalogId: catalogId, organizationId }
      });
      if (!catalog) throw new Error('Catalog not found for this order');

      const settings: any = catalog.settings || {};
      const cartSettings = settings.cartSettings || {};
      const items = orderData.product_items || [];
      const baseCurrency = cartSettings.baseCurrency || (items.length > 0 ? items[0].currency : 'USD');

      let subtotal = 0;
      for (const item of items) {
        let price = parseFloat(item.item_price || '0');
        const itemCurrency = item.currency || baseCurrency;

        if (itemCurrency !== baseCurrency) {
          try {
            const response = await axios.get(`https://api.frankfurter.app/latest?from=${itemCurrency}&to=${baseCurrency}`);
            const rate = response.data.rates[baseCurrency];
            if (rate) {
              price = price * rate;
              // Update the item itself so the frontend sees the converted price
              item.item_price = price.toFixed(2);
              item.currency = baseCurrency;
              item.original_currency = itemCurrency;
            } else {
              this.logger.warn(`Exchange rate not found for ${itemCurrency} to ${baseCurrency}`);
            }
          } catch (error) {
            this.logger.error(`Failed to fetch exchange rate from ${itemCurrency} to ${baseCurrency}`, error);
          }
        }
        subtotal += price * parseInt(item.quantity || '0');
      }

      const currency = baseCurrency;

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

      const generateOrderId = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `ORD-${result}`;
      };
      const orderUniqueId = generateOrderId();

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

      const frontendUrl = process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_URL || 'https://bizzriser-platform-frontend-yw8n-sand.vercel.app';
      const checkoutLink = `${frontendUrl}/checkout/${newOrder.id}`;
      this.logger.log(`Generated checkout link: ${checkoutLink}`);
      require('fs').appendFileSync('order-log.txt', 'SUCCESS\\n');
      return { order: newOrder, checkoutLink, totalAmount, currency };
    } catch (e: any) {
      require('fs').appendFileSync('order-log.txt', 'ERROR: ' + e.message + '\\n');
      throw e;
    }
  }

  async uploadImage(organizationId: string, file: any) {
    try {
      const fs = require('fs');
      const path = require('path');

      const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1] || 'jpeg'}`;
      const uniqueName = `product_${organizationId.slice(0, 8)}_${Date.now()}`;

      const cloudName = this.configService.get<string>('cloudinary.cloudName');
      const apiKey = this.configService.get<string>('cloudinary.apiKey');
      const apiSecret = this.configService.get<string>('cloudinary.apiSecret');

      let publicUrl = '';

      if (cloudName && apiKey && apiSecret) {
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });

        this.logger.log(`[uploadImage] Uploading product image to Cloudinary...`);
        
        publicUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              public_id: uniqueName,
              folder: `bizzriser_products/${organizationId}`,
            },
            (error: any, result: any) => {
              if (error) {
                this.logger.error(`Cloudinary upload failed: ${JSON.stringify(error)}`);
                reject(error);
              } else {
                let finalUrl = result.secure_url;
                if (!finalUrl.endsWith(ext) && !finalUrl.includes('?')) {
                  finalUrl = `${finalUrl}${ext}`;
                }
                resolve(finalUrl);
              }
            }
          );
          
          const streamifier = require('streamifier');
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });

        this.logger.log(`[uploadImage] Cloudinary Upload SUCCESS → ${publicUrl}`);
      } else {
        this.logger.log('[uploadImage] Cloudinary not configured. Falling back to local disk storage.');
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filenameToReturn = uniqueName + ext;
        const filePath = path.join(uploadsDir, filenameToReturn);
        fs.writeFileSync(filePath, file.buffer);

        const backendUrl = this.configService.get<string>('app.publicUrl') || 'http://localhost:3001';
        publicUrl = `${backendUrl}/uploads/${filenameToReturn}`;

        this.logger.log(`[uploadImage] Saved locally (${file.size} bytes) → ${publicUrl}`);
      }

      return { success: true, url: publicUrl };
    } catch (error: any) {
      this.logger.error(`[uploadImage] Failed to upload image: ${error.message}`);
      throw new InternalServerErrorException(`Failed to process image upload: ${error.message}`);
    }
  }
}