import { Controller, Get, Post, Put, Patch, Delete, Body, Req, UseGuards, Param, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Get('stats')
  async getStats(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getEcommerceStats(organizationId);
  }

  @Post('disconnect')
  async disconnectAccount(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.disconnectAccount(organizationId);
  }

  @Put('business')
  async setActiveBusiness(@Body('businessId') businessId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.setActiveBusiness(organizationId, businessId);
  }

  @Get('settings')
  async getSettings(@Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getSettings(organizationId);
  }

  @Put('settings')
  async updateSettings(@Body() data: any, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.updateSettings(organizationId, data);
  }

  @Get('catalogs/:catalogId/settings')
  async getCatalogSettings(@Param('catalogId') catalogId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getCartAndPaymentSettings(organizationId, catalogId);
  }

  @Put('catalogs/:catalogId/settings')
  async updateCatalogSettings(
    @Param('catalogId') catalogId: string,
    @Body() data: any,
    @Req() req: any
  ) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.updateCartAndPaymentSettings(organizationId, catalogId, data);
  }

  @Get('oauth/url')
  getOAuthUrl() {
    return this.metaCommerceService.generateOAuthUrl();
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: any, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    
    // Validate file type (Meta allows JPEG and PNG)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG and PNG are allowed.');
    }
    
    // Validate file size (Meta max limit is typically 8MB)
    const maxSize = 8 * 1024 * 1024; // 8MB
    if (file.size > maxSize) {
      throw new BadRequestException('File is too large. Maximum size is 8MB.');
    }

    const organizationId = req.user?.orgId;
    return this.metaCommerceService.uploadImage(organizationId, file);
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

  @Post('catalogs/:catalogId/products/bulk')
  async bulkAddProducts(@Param('catalogId') catalogId: string, @Body('products') products: any[], @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.bulkAddProducts(catalogId, organizationId, products);
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

  @Patch('catalogs/:catalogId/products/:retailerId/visibility')
  async toggleProductVisibility(
    @Param('catalogId') catalogId: string,
    @Param('retailerId') retailerId: string,
    @Body('isHidden') isHidden: boolean,
    @Req() req: any
  ) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.toggleProductVisibility(catalogId, organizationId, retailerId, isHidden);
  }

  // --- Product Sets (Collections) ---

  @Get('catalogs/:catalogId/sets')
  async getProductSets(@Param('catalogId') catalogId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.getProductSets(catalogId, organizationId);
  }

  @Post('catalogs/:catalogId/sets')
  async createProductSet(@Param('catalogId') catalogId: string, @Body() data: any, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.createProductSet(catalogId, organizationId, data.name, data.filter);
  }

  @Delete('sets/:setId')
  async deleteProductSet(@Param('setId') setId: string, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.deleteProductSet(setId, organizationId);
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

  @Put('coupons/:couponId')
  async updateCoupon(@Param('couponId') couponId: string, @Body() data: any, @Req() req: any) {
    const organizationId = req.user?.orgId;
    return this.metaCommerceService.updateCoupon(couponId, organizationId, data);
  }
}
