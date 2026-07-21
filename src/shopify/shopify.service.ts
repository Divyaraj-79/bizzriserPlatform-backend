import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly API_VERSION = '2026-07';

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ─── OAuth ────────────────────────────────────────────────────────────────

  generateOAuthUrl(shopDomain: string): string {
    const clientId = this.config.get<string>('SHOPIFY_CLIENT_ID') || process.env.SHOPIFY_CLIENT_ID;
    if (!clientId) throw new BadRequestException('Shopify OAuth is not configured on this server. Please use the manual access token method.');

    const normalizedDomain = this.normalizeShopDomain(shopDomain);
    const scopes = [
      'read_products',
      'read_inventory',
      'write_inventory',
      'read_orders',
      'write_orders',
      'read_draft_orders',
      'write_draft_orders',
      'read_fulfillments',
      'write_fulfillments',
    ].join(',');

    const redirectUri = `${this.config.get('FRONTEND_URL') || 'http://localhost:3000'}/commerce/shopify/oauth/callback`;
    const state = crypto.randomBytes(16).toString('hex');

    return `https://${normalizedDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  async handleOAuthCallback(code: string, shop: string, organizationId: string) {
    const clientId = this.config.get<string>('SHOPIFY_CLIENT_ID') || process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = this.config.get<string>('SHOPIFY_CLIENT_SECRET') || process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new InternalServerErrorException('Shopify OAuth credentials not configured');

    const normalizedDomain = this.normalizeShopDomain(shop);

    // Exchange code for access token
    const tokenRes = await axios.post(`https://${normalizedDomain}/admin/oauth/access_token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code,
    });

    const accessToken: string = tokenRes.data.access_token;
    const scope: string = tokenRes.data.scope;

    return this.saveConnection(organizationId, normalizedDomain, accessToken, scope);
  }

  // ─── Manual Token Connect ─────────────────────────────────────────────────

  async connectWithToken(organizationId: string, shopDomain: string, accessToken: string) {
    const normalizedDomain = this.normalizeShopDomain(shopDomain);

    // Validate the token by calling the Shopify API
    try {
      await axios.get(`https://${normalizedDomain}/admin/api/${this.API_VERSION}/products.json?limit=1`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });
    } catch (e: any) {
      const status = e.response?.status;
      const errorMsg = e.response?.data?.errors ? (typeof e.response.data.errors === 'string' ? e.response.data.errors : JSON.stringify(e.response.data.errors)) : e.message;
      if (status === 401 || status === 403) {
        throw new UnauthorizedException(`Invalid token or insufficient permissions (${errorMsg}). Please check your Admin API credentials.`);
      }
      throw new BadRequestException(`Could not connect to Shopify store: ${errorMsg}`);
    }

    return this.saveConnection(organizationId, normalizedDomain, accessToken, null);
  }

  private async saveConnection(organizationId: string, shopDomain: string, accessToken: string, scope: string | null) {
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const connection = await this.prisma.shopifyConnection.upsert({
      where: { organizationId },
      create: {
        organizationId,
        shopDomain,
        accessToken,
        scope,
        webhookSecret,
        apiVersion: this.API_VERSION,
      },
      update: {
        shopDomain,
        accessToken,
        scope,
        webhookSecret,
        apiVersion: this.API_VERSION,
        syncEnabled: true,
      },
    });

    // Register webhooks and do initial sync in background
    this.registerWebhooks(organizationId).catch(e => this.logger.error(`Failed to register webhooks: ${e.message}`));
    this.syncProducts(organizationId).catch(e => this.logger.error(`Initial product sync failed: ${e.message}`));

    return { success: true, shopDomain, scope };
  }

  async disconnect(organizationId: string) {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new NotFoundException('No Shopify connection found');

    // Attempt to delete webhooks from Shopify
    try {
      await this.deleteAllWebhooks(connection);
    } catch (e) {
      this.logger.warn(`Could not delete Shopify webhooks during disconnect: ${e.message}`);
    }

    await this.prisma.shopifyConnection.delete({ where: { organizationId } });
    return { success: true };
  }

  // ─── Connection Status ────────────────────────────────────────────────────

  async getConnection(organizationId: string) {
    const conn = await this.prisma.shopifyConnection.findUnique({ where: { organizationId } });
    if (!conn) return { connected: false };

    return {
      connected: true,
      shopDomain: conn.shopDomain,
      scope: conn.scope,
      syncEnabled: conn.syncEnabled,
      lastSyncedAt: conn.lastSyncedAt,
      apiVersion: conn.apiVersion,
    };
  }

  // ─── Webhook Registration ─────────────────────────────────────────────────

  private async registerWebhooks(organizationId: string) {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { organizationId } });
    if (!connection) return;

    const backendUrl = this.config.get<string>('BACKEND_URL') || 'http://localhost:3001';
    const webhookUrl = `${backendUrl}/api/v1/shopify/webhook`;

    const topics = [
      'products/create',
      'products/update',
      'products/delete',
      'orders/create',
      'orders/updated',
      'orders/paid',
      'draft_orders/create',
      'draft_orders/update',
      'inventory_levels/update',
      'app/uninstalled',
    ];

    for (const topic of topics) {
      try {
        await axios.post(
          `https://${connection.shopDomain}/admin/api/${this.API_VERSION}/webhooks.json`,
          {
            webhook: {
              topic,
              address: webhookUrl,
              format: 'json',
            },
          },
          { headers: { 'X-Shopify-Access-Token': connection.accessToken } },
        );
        this.logger.log(`Registered Shopify webhook: ${topic}`);
      } catch (e: any) {
        // 422 means webhook already exists — that's fine
        if (e.response?.status !== 422) {
          this.logger.warn(`Failed to register webhook ${topic}: ${e.message}`);
        }
      }
    }
  }

  private async deleteAllWebhooks(connection: any) {
    const res = await axios.get(
      `https://${connection.shopDomain}/admin/api/${this.API_VERSION}/webhooks.json`,
      { headers: { 'X-Shopify-Access-Token': connection.accessToken } },
    );
    const webhooks = res.data.webhooks || [];
    for (const wh of webhooks) {
      await axios.delete(
        `https://${connection.shopDomain}/admin/api/${this.API_VERSION}/webhooks/${wh.id}.json`,
        { headers: { 'X-Shopify-Access-Token': connection.accessToken } },
      );
    }
  }

  // ─── Product Sync ─────────────────────────────────────────────────────────

  async syncProducts(organizationId: string): Promise<{ synced: number }> {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { organizationId } });
    if (!connection || !connection.syncEnabled) return { synced: 0 };

    let syncedCount = 0;
    let pageInfo: string | null = null;
    const limit = 250;

    do {
      const params: any = { limit, status: 'active,archived,draft' };
      if (pageInfo) params.page_info = pageInfo;

      const res = await axios.get(
        `https://${connection.shopDomain}/admin/api/${this.API_VERSION}/products.json`,
        {
          params,
          headers: { 'X-Shopify-Access-Token': connection.accessToken },
        },
      );

      const products: any[] = res.data.products || [];

      for (const product of products) {
        await this.upsertShopifyProduct(organizationId, connection.shopDomain, product);
        syncedCount++;
      }

      // Parse cursor-based pagination from Link header
      const linkHeader = res.headers['link'];
      pageInfo = this.extractNextPageInfo(linkHeader);
    } while (pageInfo);

    // Mark sync time
    await this.prisma.shopifyConnection.update({
      where: { organizationId },
      data: { lastSyncedAt: new Date() },
    });

    this.logger.log(`[Shopify] Synced ${syncedCount} products for org ${organizationId}`);
    return { synced: syncedCount };
  }

  private async upsertShopifyProduct(organizationId: string, shopDomain: string, product: any) {
    const defaultVariant = product.variants?.[0];
    const defaultImage = product.images?.[0]?.src || product.image?.src;
    const additionalImages = (product.images || [])
      .slice(1)
      .map((img: any) => img.src)
      .filter(Boolean);

    // Calculate total inventory across all variants
    const inventory = (product.variants || []).reduce((sum: number, v: any) => {
      return sum + (v.inventory_quantity || 0);
    }, 0);

    // Get the existing record to preserve isHidden flag
    const existing = await this.prisma.shopifyProduct.findUnique({
      where: { organizationId_shopifyProductId: { organizationId, shopifyProductId: String(product.id) } },
      select: { isHidden: true },
    });

    await this.prisma.shopifyProduct.upsert({
      where: {
        organizationId_shopifyProductId: {
          organizationId,
          shopifyProductId: String(product.id),
        },
      },
      create: {
        organizationId,
        shopifyProductId: String(product.id),
        shopifyVariantId: defaultVariant ? String(defaultVariant.id) : null,
        title: product.title,
        description: product.body_html?.replace(/<[^>]*>/g, '') || null,
        handle: product.handle,
        productType: product.product_type || null,
        vendor: product.vendor || null,
        status: product.status || 'active',
        imageUrl: defaultImage || null,
        additionalImages,
        price: defaultVariant?.price || null,
        compareAtPrice: defaultVariant?.compare_at_price || null,
        inventory,
        sku: defaultVariant?.sku || null,
        tags: product.tags ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        shopifyProductUrl: `https://${shopDomain}/products/${product.handle}`,
        variantsJson: product.variants || [],
        isHidden: false,
      },
      update: {
        shopifyVariantId: defaultVariant ? String(defaultVariant.id) : null,
        title: product.title,
        description: product.body_html?.replace(/<[^>]*>/g, '') || null,
        handle: product.handle,
        productType: product.product_type || null,
        vendor: product.vendor || null,
        status: product.status || 'active',
        imageUrl: defaultImage || null,
        additionalImages,
        price: defaultVariant?.price || null,
        compareAtPrice: defaultVariant?.compare_at_price || null,
        inventory,
        sku: defaultVariant?.sku || null,
        tags: product.tags ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        shopifyProductUrl: `https://${shopDomain}/products/${product.handle}`,
        variantsJson: product.variants || [],
        // Preserve isHidden flag — don't overwrite it on sync
        ...(existing?.isHidden !== undefined ? {} : { isHidden: false }),
      },
    });
  }

  private extractNextPageInfo(linkHeader: string | undefined): string | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<[^>]*[?&]page_info=([^>&"]+)[^>]*>;\s*rel="next"/);
    return match ? match[1] : null;
  }

  // ─── Product Management ───────────────────────────────────────────────────

  async getProducts(organizationId: string, page = 1, limit = 20, search?: string, status?: string) {
    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { productType: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.shopifyProduct.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.shopifyProduct.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async toggleProductVisibility(organizationId: string, productId: string, hidden: boolean) {
    const product = await this.prisma.shopifyProduct.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.shopifyProduct.update({
      where: { id: productId },
      data: { isHidden: hidden },
    });
  }

  // ─── Draft Order Creation (WhatsApp Cart → Shopify) ───────────────────────

  async createDraftOrder(organizationId: string, cartItems: WhatsAppCartItem[], buyerInfo: BuyerInfo): Promise<DraftOrderResult> {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { organizationId } });
    if (!connection) throw new NotFoundException('No Shopify connection found');

    // Build line items for Draft Order
    const lineItems = cartItems.map(item => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      price: item.price,
    }));

    const draftOrderPayload: any = {
      draft_order: {
        line_items: lineItems,
        customer: {
          first_name: buyerInfo.firstName || buyerInfo.name?.split(' ')[0] || 'Customer',
          last_name: buyerInfo.lastName || buyerInfo.name?.split(' ').slice(1).join(' ') || '',
          phone: buyerInfo.phone,
          email: buyerInfo.email,
        },
        note: `Order received via WhatsApp from ${buyerInfo.phone}`,
        send_invoice: false, // We'll send the invoice URL via WhatsApp ourselves
        use_customer_default_address: false,
      },
    };

    try {
      const res = await axios.post(
        `https://${connection.shopDomain}/admin/api/${this.API_VERSION}/draft_orders.json`,
        draftOrderPayload,
        { headers: { 'X-Shopify-Access-Token': connection.accessToken, 'Content-Type': 'application/json' } },
      );

      const draftOrder = res.data.draft_order;
      const invoiceUrl = draftOrder.invoice_url;

      // Deduct inventory for each item
      for (const item of cartItems) {
        await this.decrementInventory(organizationId, item.productId, item.quantity).catch(e =>
          this.logger.warn(`Inventory decrement failed for product ${item.productId}: ${e.message}`)
        );
      }

      // Save locally
      const uniqueOrderId = `SHOPIFY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const localOrder = await this.prisma.shopifyOrder.create({
        data: {
          organizationId,
          shopifyOrderId: String(draftOrder.id),
          shopifyOrderNumber: null,
          draftOrderId: String(draftOrder.id),
          buyerPhone: buyerInfo.phone,
          buyerEmail: buyerInfo.email,
          buyerName: buyerInfo.name,
          totalPrice: draftOrder.total_price,
          currency: draftOrder.currency,
          financialStatus: 'pending',
          fulfillmentStatus: null,
          status: 'PENDING',
          source: 'WHATSAPP',
          lineItems: draftOrder.line_items || [],
          checkoutUrl: invoiceUrl,
          metadata: { draftOrderName: draftOrder.name, uniqueId: uniqueOrderId },
        },
      });

      return {
        orderId: localOrder.id,
        shopifyDraftOrderId: String(draftOrder.id),
        invoiceUrl,
        totalPrice: draftOrder.total_price,
        currency: draftOrder.currency,
        lineItems: draftOrder.line_items,
      };
    } catch (e: any) {
      const errMsg = e.response?.data?.errors || e.message;
      this.logger.error(`Failed to create Shopify draft order: ${JSON.stringify(errMsg)}`);
      throw new InternalServerErrorException(`Failed to create Shopify order: ${JSON.stringify(errMsg)}`);
    }
  }

  private async decrementInventory(organizationId: string, productId: string, quantity: number) {
    // Update local DB
    const product = await this.prisma.shopifyProduct.findFirst({ where: { id: productId, organizationId } });
    if (!product || product.inventory === null) return;

    const newInventory = Math.max(0, product.inventory - quantity);
    await this.prisma.shopifyProduct.update({
      where: { id: productId },
      data: { inventory: newInventory },
    });
    // Note: Shopify auto-decrements inventory when a Draft Order is completed/paid.
    // We update local DB here for immediate UI reflection.
  }

  // ─── Order Sync ───────────────────────────────────────────────────────────

  async syncOrders(organizationId: string, days = 30): Promise<{ synced: number }> {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { organizationId } });
    if (!connection) return { synced: 0 };

    const since = new Date();
    since.setDate(since.getDate() - days);

    let syncedCount = 0;
    let pageInfo: string | null = null;

    do {
      const params: any = {
        limit: 250,
        status: 'any',
        created_at_min: since.toISOString(),
      };
      if (pageInfo) params.page_info = pageInfo;

      const res = await axios.get(
        `https://${connection.shopDomain}/admin/api/${this.API_VERSION}/orders.json`,
        { params, headers: { 'X-Shopify-Access-Token': connection.accessToken } },
      );

      const orders: any[] = res.data.orders || [];
      for (const order of orders) {
        await this.upsertShopifyOrder(organizationId, order);
        syncedCount++;
      }

      pageInfo = this.extractNextPageInfo(res.headers['link']);
    } while (pageInfo);

    return { synced: syncedCount };
  }

  private async upsertShopifyOrder(organizationId: string, order: any) {
    const phone = order.customer?.phone || order.billing_address?.phone || null;
    const email = order.customer?.email || null;
    const name = order.customer
      ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
      : null;

    await this.prisma.shopifyOrder.upsert({
      where: { organizationId_shopifyOrderId: { organizationId, shopifyOrderId: String(order.id) } },
      create: {
        organizationId,
        shopifyOrderId: String(order.id),
        shopifyOrderNumber: order.name,
        buyerPhone: phone,
        buyerEmail: email,
        buyerName: name,
        totalPrice: order.total_price,
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        status: this.mapShopifyFinancialStatus(order.financial_status),
        source: 'SHOPIFY_NATIVE',
        lineItems: order.line_items || [],
        shippingAddress: order.shipping_address || {},
        checkoutUrl: order.order_status_url,
        shopifyCheckoutUrl: order.order_status_url,
      },
      update: {
        shopifyOrderNumber: order.name,
        buyerPhone: phone,
        buyerEmail: email,
        buyerName: name,
        totalPrice: order.total_price,
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        status: this.mapShopifyFinancialStatus(order.financial_status),
        lineItems: order.line_items || [],
        shippingAddress: order.shipping_address || {},
        checkoutUrl: order.order_status_url,
        shopifyCheckoutUrl: order.order_status_url,
      },
    });
  }

  private mapShopifyFinancialStatus(financialStatus: string): string {
    switch (financialStatus) {
      case 'paid': return 'PAID';
      case 'refunded':
      case 'voided': return 'CANCELLED';
      case 'pending': return 'PENDING';
      default: return 'PENDING';
    }
  }

  async getOrders(organizationId: string, page = 1, limit = 20, search?: string, status?: string) {
    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { buyerPhone: { contains: search, mode: 'insensitive' } },
        { buyerName: { contains: search, mode: 'insensitive' } },
        { shopifyOrderNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.shopifyOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shopifyOrder.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats(organizationId: string) {
    const [totalProducts, activeProducts, hiddenProducts, totalOrders, paidOrders, pendingOrders] = await Promise.all([
      this.prisma.shopifyProduct.count({ where: { organizationId } }),
      this.prisma.shopifyProduct.count({ where: { organizationId, status: 'active', isHidden: false } }),
      this.prisma.shopifyProduct.count({ where: { organizationId, isHidden: true } }),
      this.prisma.shopifyOrder.count({ where: { organizationId } }),
      this.prisma.shopifyOrder.count({ where: { organizationId, financialStatus: 'paid' } }),
      this.prisma.shopifyOrder.count({ where: { organizationId, status: 'PENDING' } }),
    ]);

    return { totalProducts, activeProducts, hiddenProducts, totalOrders, paidOrders, pendingOrders };
  }

  // ─── Webhook Handling ─────────────────────────────────────────────────────

  async verifyAndHandleWebhook(
    shopDomain: string,
    topic: string,
    rawBody: Buffer,
    hmacHeader: string,
  ): Promise<void> {
    // Find the connection for this shop
    const connection = await this.prisma.shopifyConnection.findFirst({
      where: { shopDomain: this.normalizeShopDomain(shopDomain) },
    });

    if (!connection) {
      this.logger.warn(`Webhook from unknown shop: ${shopDomain}`);
      return;
    }

    // Verify HMAC
    if (connection.webhookSecret) {
      const computedHmac = crypto
        .createHmac('sha256', connection.webhookSecret)
        .update(rawBody)
        .digest('base64');

      if (computedHmac !== hmacHeader) {
        this.logger.warn(`Invalid Shopify webhook HMAC from ${shopDomain}`);
        return;
      }
    }

    const body = JSON.parse(rawBody.toString('utf-8'));

    switch (topic) {
      case 'products/create':
      case 'products/update':
        await this.upsertShopifyProduct(connection.organizationId, connection.shopDomain, body).catch(e =>
          this.logger.error(`Webhook upsert product failed: ${e.message}`)
        );
        break;

      case 'products/delete':
        await this.prisma.shopifyProduct.deleteMany({
          where: { organizationId: connection.organizationId, shopifyProductId: String(body.id) },
        }).catch(e => this.logger.error(`Webhook delete product failed: ${e.message}`));
        break;

      case 'orders/create':
      case 'orders/updated':
      case 'orders/paid':
        await this.upsertShopifyOrder(connection.organizationId, body).catch(e =>
          this.logger.error(`Webhook upsert order failed: ${e.message}`)
        );
        break;

      case 'draft_orders/update':
        // When a draft order is paid/completed, update its status locally
        if (body.status === 'completed' && body.order_id) {
          await this.prisma.shopifyOrder.updateMany({
            where: {
              organizationId: connection.organizationId,
              draftOrderId: String(body.id),
            },
            data: {
              shopifyOrderId: String(body.order_id),
              shopifyOrderNumber: body.name,
              financialStatus: 'paid',
              status: 'PAID',
            },
          });
        }
        break;

      case 'inventory_levels/update':
        // Update local inventory for the affected variant
        await this.handleInventoryUpdate(connection.organizationId, body).catch(e =>
          this.logger.error(`Webhook inventory update failed: ${e.message}`)
        );
        break;

      case 'app/uninstalled':
        this.logger.warn(`[Shopify] App uninstalled from ${shopDomain} — disconnecting`);
        await this.prisma.shopifyConnection.delete({ where: { organizationId: connection.organizationId } });
        break;

      default:
        this.logger.debug(`Unhandled Shopify webhook topic: ${topic}`);
    }
  }

  private async handleInventoryUpdate(organizationId: string, body: any) {
    const inventoryItemId = body.inventory_item_id;
    const available = body.available;
    if (!inventoryItemId || available === undefined) return;

    // Find the product with this inventory item (via variant SKU or product sync)
    // We do a best-effort update based on variant data stored in variantsJson
    const products = await this.prisma.shopifyProduct.findMany({
      where: { organizationId },
      select: { id: true, variantsJson: true, inventory: true },
    });

    for (const product of products) {
      const variants = (product.variantsJson as any[]) || [];
      const matchingVariant = variants.find((v: any) => v.inventory_item_id === inventoryItemId);
      if (matchingVariant) {
        // Recalculate total inventory by updating this variant's quantity
        const updatedVariants = variants.map((v: any) => {
          if (v.inventory_item_id === inventoryItemId) {
            return { ...v, inventory_quantity: available };
          }
          return v;
        });
        const totalInventory = updatedVariants.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);

        await this.prisma.shopifyProduct.update({
          where: { id: product.id },
          data: { inventory: totalInventory, variantsJson: updatedVariants },
        });
        break;
      }
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  normalizeShopDomain(domain: string): string {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  isOAuthConfigured(): boolean {
    const clientId = this.config.get('SHOPIFY_CLIENT_ID') || process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = this.config.get('SHOPIFY_CLIENT_SECRET') || process.env.SHOPIFY_CLIENT_SECRET;
    return !!(clientId && clientSecret);
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface WhatsAppCartItem {
  productId: string;       // BizzRiser ShopifyProduct ID
  shopifyProductId: string;
  variantId: string;
  title: string;
  quantity: number;
  price: string;
}

export interface BuyerInfo {
  phone: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface DraftOrderResult {
  orderId: string;
  shopifyDraftOrderId: string;
  invoiceUrl: string;
  totalPrice: string;
  currency: string;
  lineItems: any[];
}
