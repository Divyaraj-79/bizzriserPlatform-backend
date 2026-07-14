import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
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
  async createSubscription(@Body() data: { orgId: string, planId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY', offerCode?: string }) {
    return this.razorpayService.createSubscription(data.orgId, data.planId, data.billingCycle, data.offerCode);
  }
}
