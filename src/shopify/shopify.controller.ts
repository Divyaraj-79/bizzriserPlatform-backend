import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';

@Controller('shopify')
@UseGuards(JwtAuthGuard)
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

  // ─── Connection ──────────────────────────────────────────────────────────

  @Get('connection')
  async getConnection(@Req() req: any) {
    return this.shopifyService.getConnection(req.user.orgId);
  }

  @Get('oauth/url')
  async getOAuthUrl(@Query('shop') shopDomain: string) {
    const isConfigured = this.shopifyService.isOAuthConfigured();
    if (!isConfigured) {
      return { oauthAvailable: false, message: 'OAuth not configured on this server. Use manual access token.' };
    }
    const url = this.shopifyService.generateOAuthUrl(shopDomain);
    return { oauthAvailable: true, url };
  }

  @Get('oauth/callback')
  async oAuthCallback(@Query('code') code: string, @Query('shop') shop: string, @Req() req: any) {
    return this.shopifyService.handleOAuthCallback(code, shop, req.user.orgId);
  }

  @Post('connect')
  async connectWithToken(@Body() body: { shopDomain: string; accessToken: string }, @Req() req: any) {
    return this.shopifyService.connectWithToken(req.user.orgId, body.shopDomain, body.accessToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('disconnect')
  async disconnect(@Req() req: any) {
    return this.shopifyService.disconnect(req.user.orgId);
  }

  // ─── Sync ────────────────────────────────────────────────────────────────

  @HttpCode(HttpStatus.OK)
  @Post('sync')
  async triggerSync(@Req() req: any) {
    const [products, orders] = await Promise.all([
      this.shopifyService.syncProducts(req.user.orgId),
      this.shopifyService.syncOrders(req.user.orgId),
    ]);
    return { products, orders };
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  @Get('products')
  async getProducts(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.shopifyService.getProducts(
      req.user.orgId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
      status,
    );
  }

  @Patch('products/:id/visibility')
  async toggleVisibility(
    @Param('id') id: string,
    @Body('hidden') hidden: boolean,
    @Req() req: any,
  ) {
    return this.shopifyService.toggleProductVisibility(req.user.orgId, id, hidden);
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  @Get('orders')
  async getOrders(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.shopifyService.getOrders(
      req.user.orgId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
      status,
    );
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  @Get('stats')
  async getStats(@Req() req: any) {
    return this.shopifyService.getStats(req.user.orgId);
  }
}
