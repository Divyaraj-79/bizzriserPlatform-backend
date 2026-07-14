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

    if (plan.isContactOnly) {
      throw new BadRequestException('This plan requires contacting sales.');
    }

    let razorpayPlanId: string = '';
    let price = 0;
    
    if (billingCycle === 'QUARTERLY') {
      razorpayPlanId = plan.razorpayQuarterlyPlanId ?? '';
      price = plan.quarterlyPrice ?? 0;
    } else if (billingCycle === 'YEARLY') {
      razorpayPlanId = plan.razorpayYearlyPlanId ?? '';
      price = plan.yearlyPrice ?? 0;
    } else {
      throw new BadRequestException(`Unsupported billing cycle: ${billingCycle}`);
    }

    if (!razorpayPlanId) throw new BadRequestException(`Razorpay Plan ID not configured for ${billingCycle} billing`);

    let offer;
    if (offerCodeStr) {
      offer = await this.offerCodesService.validate(offerCodeStr, planId);
    }

    let totalCount = 1200;
    if (billingCycle === 'QUARTERLY') totalCount = 400;
    if (billingCycle === 'YEARLY') totalCount = 100;

    // Call Razorpay API to create subscription
    const payload: any = {
      plan_id: razorpayPlanId,
      total_count: totalCount,
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
        
        const pkg = await this.prisma.package.findUnique({ where: { id: sub.packageId } });
        
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
              razorpayCustomerId: rzpSubscription.customer_id,
              credits: pkg?.credits && pkg.credits > 0 ? { increment: pkg.credits } : undefined
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

  async verifySubscription(
    razorpayPaymentId: string,
    razorpaySubscriptionId: string,
    razorpaySignature: string
  ) {
    const secret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(razorpayPaymentId + '|' + razorpaySubscriptionId)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      this.logger.error('Invalid Razorpay signature in verifySubscription');
      throw new BadRequestException('Invalid signature');
    }

    const sub = await this.prisma.razorpaySubscription.findUnique({
      where: { razorpaySubscriptionId: razorpaySubscriptionId }
    });

    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    if (sub.status === 'ACTIVE') {
      return { success: true, message: 'Already activated' };
    }

    const pkg = await this.prisma.package.findUnique({ where: { id: sub.packageId } });

    let currentEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let customerId = undefined;
    try {
      const rzpSub = await this.razorpay.subscriptions.fetch(razorpaySubscriptionId);
      if (rzpSub) {
        currentEnd = new Date(rzpSub.current_end * 1000);
        customerId = rzpSub.customer_id;
      }
    } catch (err) {
      this.logger.warn('Failed to fetch subscription from Razorpay during verification', err);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.razorpaySubscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          razorpayCustomerId: customerId,
          currentPeriodEnd: currentEnd,
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
          subscriptionEndsAt: currentEnd,
          razorpayCustomerId: customerId,
          credits: pkg?.credits && pkg.credits > 0 ? { increment: pkg.credits } : undefined
        }
      });
    });

    return { success: true };
  }
}
