import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OfferCodesService } from '../offer-codes/offer-codes.service';
import { MailService } from '../auth/mail.service';
import { SubscriptionStatus } from '@prisma/client';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
  private razorpay: any;
  private readonly logger = new Logger(RazorpayService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly offerCodesService: OfferCodesService,
    private readonly mailService: MailService,
  ) {
    const key_id = this.configService.get<string>('RAZORPAY_KEY_ID');
    const key_secret = this.configService.get<string>('RAZORPAY_KEY_SECRET');

    if (!key_id || !key_secret) {
      this.logger.error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing! Payments will not work.');
      // Initialize with dummy values so the server can at least boot and serve other requests
      this.razorpay = new Razorpay({
        key_id: 'dummy_key_id',
        key_secret: 'dummy_key_secret',
      });
    } else {
      this.razorpay = new Razorpay({
        key_id,
        key_secret,
      });
    }
  }

  async createSubscription(orgId: string, planId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY', offerCodeStr?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { users: { take: 1, orderBy: { createdAt: 'asc' } } }
    });
    if (!org) throw new NotFoundException('Organization not found');

    const plan = await this.prisma.package.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    let razorpayPlanId: string = '';
    let price = 0;
    if (billingCycle === 'MONTHLY') {
      razorpayPlanId = plan.razorpayMonthlyPlanId ?? '';
      price = plan.monthlyPrice ?? 0;
    } else if (billingCycle === 'QUARTERLY') {
      razorpayPlanId = plan.razorpayQuarterlyPlanId ?? '';
      price = plan.quarterlyPrice ?? 0;
    } else {
      razorpayPlanId = plan.razorpayYearlyPlanId ?? '';
      price = plan.yearlyPrice ?? 0;
    }

    if (!razorpayPlanId) throw new BadRequestException(`Razorpay Plan ID not configured for ${billingCycle} billing`);

    let offer;
    if (offerCodeStr) {
      offer = await this.offerCodesService.validate(offerCodeStr, planId);
    }

    // Call Razorpay API to create subscription
    const payload: any = {
      plan_id: razorpayPlanId,
      total_count: 1200, // Large number for recurring
      customer_notify: 1,
    };

    if (offer) {
      if (offer.type === 'PERCENTAGE') {
        // Not natively supported by basic subscriptions API unless using Add-ons or Offer IDs.
        // Assuming offer is mapped to a Razorpay Offer if configured, else this might need adjusting
        // payload.offer_id = ... 
      }
    }

    const rzpSub = await this.razorpay.subscriptions.create(payload);

    const subscription = await this.prisma.razorpaySubscription.create({
      data: {
        organizationId: orgId,
        packageId: planId,
        razorpaySubscriptionId: rzpSub.id,
        billingCycle,
        amount: price,
        status: SubscriptionStatus.TRIAL,
        offerCodeId: offer?.id
      }
    });

    return { subscriptionId: rzpSub.id, shortUrl: rzpSub.short_url };
  }

  async handleWebhook(req: RawBodyRequest<Request>) {
    const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';
    const signature = req.headers['x-razorpay-signature'] as string;
    
    // We need the raw body to verify signature
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body for signature verification');
    }
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(req.rawBody);
    const digest = shasum.digest('hex');

    if (digest !== signature) {
      this.logger.error('Invalid Razorpay signature');
      throw new BadRequestException('Invalid signature');
    }

    const body = req.body;
    const event = body.event;
    const rzpSubscription = body.payload.subscription?.entity;

    if (!rzpSubscription) return { status: 'ignored' };

    const sub = await this.prisma.razorpaySubscription.findUnique({
      where: { razorpaySubscriptionId: rzpSubscription.id }
    });

    if (!sub) return { status: 'subscription_not_found' };

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        const nextBillingDate = new Date(rzpSubscription.current_end * 1000);
        
        await this.prisma.$transaction(async (tx) => {
          await tx.razorpaySubscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              razorpayCustomerId: rzpSubscription.customer_id,
              currentPeriodEnd: nextBillingDate,
              webhookVerified: true
            }
          });

          await tx.organization.update({
            where: { id: sub.organizationId },
            data: {
              subscriptionStatus: 'ACTIVE',
              billingCycle: sub.billingCycle,
              packageId: sub.packageId,
              subscriptionId: sub.id,
              subscriptionEndsAt: nextBillingDate,
              razorpayCustomerId: rzpSubscription.customer_id
            }
          });
        });
        break;
      }
      case 'subscription.cancelled':
      case 'subscription.halted': {
        await this.prisma.$transaction(async (tx) => {
          await tx.razorpaySubscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELLED' }
          });

          await tx.organization.update({
            where: { id: sub.organizationId },
            data: { subscriptionStatus: 'CANCELLED' }
          });
        });
        break;
      }
      // other events...
    }

    return { status: 'ok' };
  }
}
