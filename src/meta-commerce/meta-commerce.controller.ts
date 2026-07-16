import { Controller, Get, Post, Put, Delete, Body, Req, UseGuards, Param } from '@nestjs/common';
import { MetaCommerceService } from './meta-commerce.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';

@Controller('meta-commerce')
@UseGuards(JwtAuthGuard)
export class MetaCommerceController {
  constructor(private readonly metaCommerceService: MetaCommerceService) {}

  @Get('status')
  async getStatus(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getStatus(organizationId);
  }

  @Post('disconnect')
  async disconnectAccount(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.disconnectAccount(organizationId);
  }

  @Get('oauth/url')
  getOAuthUrl() {
    return this.metaCommerceService.generateOAuthUrl();
  }

  @Post('oauth/callback')
  async handleOAuthCallback(@Body('code') code: string, @Req() req: any) {
    const organizationId = req.user?.orgId; 
    return this.metaCommerceService.handleOAuthCallback(code, organizationId);
  }

  @Get('businesses')
  async getBusinesses(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getBusinesses(organizationId);
  }

  @Get('catalogs')
  async getCatalogs(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getCatalogs(organizationId);
  }

  // --- Products ---

  @Get('catalogs/:catalogId/products')
  async getProducts(@Param('catalogId') catalogId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getProducts(catalogId, organizationId);
  }

  @Post('catalogs/:catalogId/products')
  async addProduct(@Param('catalogId') catalogId: string, @Body() data: any, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.addProduct(catalogId, organizationId, data);
  }

  @Put('catalogs/:catalogId/products/:retailerId')
  async updateProduct(
    @Param('catalogId') catalogId: string, 
    @Param('retailerId') retailerId: string, 
    @Body() data: any, 
    @Req() req: any
  ) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.updateProduct(catalogId, organizationId, retailerId, data);
  }

  @Delete('catalogs/:catalogId/products/:retailerId')
  async deleteProduct(
    @Param('catalogId') catalogId: string, 
    @Param('retailerId') retailerId: string, 
    @Req() req: any
  ) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.deleteProduct(catalogId, organizationId, retailerId);
  }

  @Post('catalogs/:catalogId/sync')
  async syncCatalog(@Param('catalogId') catalogId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.syncCatalog(catalogId, organizationId);
  }

  // --- Orders ---

  @Get('orders')
  async getOrders(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getOrders(organizationId);
  }

  @Put('orders/:orderId/status')
  async updateOrderStatus(@Param('orderId') orderId: string, @Body('status') status: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.updateOrderStatus(orderId, status, organizationId);
  }

  // --- Coupons ---

  @Get('catalogs/:catalogId/coupons')
  async getCoupons(@Param('catalogId') catalogId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getCoupons(catalogId, organizationId);
  }

  @Post('catalogs/:catalogId/coupons')
  async createCoupon(@Param('catalogId') catalogId: string, @Body() data: any, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.createCoupon(catalogId, organizationId, data);
  }

  @Delete('coupons/:couponId')
  async deleteCoupon(@Param('couponId') couponId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.deleteCoupon(couponId, organizationId);
  }
}
