import { Controller, Post, Body, Req, UseGuards, BadRequestException, Get, Query } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { RazorpayService } from './razorpay.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('razorpay')
export class RazorpayController {
  constructor(private readonly razorpayService: RazorpayService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.razorpayService.handleWebhook(req);
  }

  @UseGuards(JwtAuthGuard)
  @Post('create-subscription')
  async createSubscription(
    @Req() req: any,
    @Body() data: { orgId?: string, planId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY', offerCode?: string }
  ) {
    let orgId = data.orgId || req.user?.orgId;
    if (!orgId && req.user?.sub) {
      const user = await this.razorpayService['prisma'].user.findUnique({ where: { id: req.user.sub } });
      orgId = user?.organizationId;
    }
    if (!orgId) {
      throw new BadRequestException('Organization ID is missing');
    }
    return this.razorpayService.createSubscription(orgId, data.planId, data.billingCycle, data.offerCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-subscription')
  async verifySubscription(
    @Body() data: { razorpayPaymentId: string, razorpaySubscriptionId: string, razorpaySignature: string }
  ) {
    if (!data.razorpayPaymentId || !data.razorpaySubscriptionId || !data.razorpaySignature) {
      throw new BadRequestException('Missing payment verification details');
    }
    return this.razorpayService.verifySubscription(
      data.razorpayPaymentId,
      data.razorpaySubscriptionId,
      data.razorpaySignature
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-subscriptions')
  async getMySubscriptions(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.razorpayService.getMySubscriptions(req.user.orgId, parseInt(page, 10), parseInt(limit, 10));
  }
}
