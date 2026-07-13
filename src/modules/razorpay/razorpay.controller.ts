import { Controller, Post, Body, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { RazorpayService } from './razorpay.service';

@Controller('razorpay')
export class RazorpayController {
  constructor(private readonly razorpayService: RazorpayService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.razorpayService.handleWebhook(req);
  }

  @Post('create-subscription')
  async createSubscription(@Body() data: { orgId: string, planId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY', offerCode?: string }) {
    return this.razorpayService.createSubscription(data.orgId, data.planId, data.billingCycle, data.offerCode);
  }
}
