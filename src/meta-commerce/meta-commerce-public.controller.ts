import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { MetaCommerceService } from './meta-commerce.service';

@Controller('public-commerce')
export class MetaCommercePublicController {
  constructor(private readonly metaCommerceService: MetaCommerceService) {}

  @Get('orders/:id/checkout')
  async getCheckoutSession(@Param('id') id: string) {
    return this.metaCommerceService.getCheckoutSession(id);
  }

  @Post('orders/:id/apply-coupon')
  async applyCoupon(@Param('id') id: string, @Body('code') code: string) {
    return this.metaCommerceService.applyCoupon(id, code);
  }
}
