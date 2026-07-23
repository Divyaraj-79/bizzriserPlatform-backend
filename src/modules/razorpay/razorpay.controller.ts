import { Controller, Post, Body, Req, UseGuards, BadRequestException, Get, Query } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { RazorpayService } from './razorpay.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('razorpay')
export class RazorpayController {
  constructor(
    private readonly razorpayService: RazorpayService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.razorpayService.handleWebhook(req);
  }

  /**
   * Create a Razorpay subscription for a user who is in PENDING_PAYMENT onboarding state.
   * invitationEmail comes from the staging JWT (or body for new flow).
   * orgId is always derived from the JWT — never trusted from the request body.
   */
  @UseGuards(JwtAuthGuard)
  @Post('create-subscription')
  async createSubscription(
    @Req() req: any,
    @Body() data: { planId: string; billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; offerCode?: string; invitationEmail?: string }
  ) {
    // orgId is always from JWT — never from body (prevents orgId spoofing)
    const orgId: string | undefined = req.user?.orgId || undefined;

    // For new onboarding flow: invitationEmail from body (staging JWT context)
    // For existing org upgrades: use the email from the JWT user
    let invitationEmail: string = data.invitationEmail || req.user?.email || '';

    if (!invitationEmail) {
      // Try to look up the org's invitation email
      if (orgId) {
        const inv = await this.prisma.clientInvitation.findFirst({ where: { organizationId: orgId } });
        invitationEmail = inv?.email || req.user?.email || '';
      }
    }

    if (!invitationEmail) {
      throw new BadRequestException('Could not determine invitation email for subscription creation.');
    }

    return this.razorpayService.createSubscription(
      invitationEmail,
      data.planId,
      data.billingCycle,
      orgId,
      data.offerCode,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-subscription')
  async verifySubscription(
    @Body() data: { razorpayPaymentId: string; razorpaySubscriptionId: string; razorpaySignature: string }
  ) {
    if (!data.razorpayPaymentId || !data.razorpaySubscriptionId || !data.razorpaySignature) {
      throw new BadRequestException('Missing payment verification details');
    }
    return this.razorpayService.verifySubscription(
      data.razorpayPaymentId,
      data.razorpaySubscriptionId,
      data.razorpaySignature,
    );
  }

  /**
   * Poll this endpoint after payment to check if webhook has activated the account.
   * Returns status: CREATED | ACTIVE | PAYMENT_FAILED | NOT_FOUND
   */
  @UseGuards(JwtAuthGuard)
  @Get('subscription-status')
  async getSubscriptionStatus(@Req() req: any, @Query('email') email?: string) {
    const lookupEmail = email || req.user?.email;
    if (!lookupEmail) throw new BadRequestException('Email is required');
    return this.razorpayService.getSubscriptionStatus(lookupEmail);
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
