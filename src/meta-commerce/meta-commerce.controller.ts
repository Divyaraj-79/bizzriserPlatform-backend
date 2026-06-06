import { Controller, Get, Post, Body, Req, UseGuards, Param } from '@nestjs/common';
import { MetaCommerceService } from './meta-commerce.service';
import { Request } from 'express';

@Controller('meta-commerce')
export class MetaCommerceController {
  constructor(private readonly metaCommerceService: MetaCommerceService) {}

  @Get('oauth/url')
  getOAuthUrl() {
    return this.metaCommerceService.generateOAuthUrl();
  }

  @Post('oauth/callback')
  async handleOAuthCallback(@Body('code') code: string, @Req() req: any) {
    // For now assuming organizationId is hardcoded or extracted from req.user
    const organizationId = req.user?.organizationId || 'default-org-id'; 
    return this.metaCommerceService.handleOAuthCallback(code, organizationId);
  }

  @Get('businesses')
  async getBusinesses(@Req() req: any) {
    const organizationId = req.user?.organizationId || 'default-org-id';
    return this.metaCommerceService.getBusinesses(organizationId);
  }

  @Get('businesses/:businessId/catalogs')
  async getCatalogs(@Param('businessId') businessId: string, @Req() req: any) {
    const organizationId = req.user?.organizationId || 'default-org-id';
    return this.metaCommerceService.getCatalogs(businessId, organizationId);
  }

  @Get('catalogs/:catalogId/products')
  async getProducts(@Param('catalogId') catalogId: string, @Req() req: any) {
    const organizationId = req.user?.organizationId || 'default-org-id';
    return this.metaCommerceService.getProducts(catalogId, organizationId);
  }
}
