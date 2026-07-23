import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OfferCodesService } from '../offer-codes/offer-codes.service';
import { MailService } from '../auth/mail.service';
import { AuthService } from '../auth/auth.service';
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
    private readonly authService: AuthService,
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

  async getMySubscriptions(orgId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.razorpaySubscription.findMany({
        where: { organizationId: orgId },
        include: { package: { select: { name: true, description: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.razorpaySubscription.count({ where: { organizationId: orgId } })
    ]);
    return { data, total, page, limit };
  }

  async createSubscription(
    invitationEmail: string,
    planId: string,
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
    orgId?: string,
    offerCodeStr?: string,
  ) {
    // Guard against duplicate active subscriptions for this email
    const existingActive = await this.prisma.razorpaySubscription.findFirst({
      where: {
        invitationEmail,
        status: { in: ['ACTIVE', 'CREATED'] },
      },
    });
    if (existingActive) {
      this.logger.warn(`[createSubscription] Active/created subscription already exists for email ${invitationEmail}`);
      // Return existing sub so frontend can open the Razorpay modal again
      return { subscriptionId: existingActive.razorpaySubscriptionId };
    }

    // Also guard org-level duplicates when orgId is known
    if (orgId) {
      const existingOrgActive = await this.prisma.razorpaySubscription.findFirst({
        where: {
          organizationId: orgId,
          status: { in: ['ACTIVE'] },
        },
      });
      if (existingOrgActive) {
        throw new BadRequestException('Organization already has an active subscription.');
      }
    }

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

    // Auto-create plan on Razorpay if not configured
    if (!razorpayPlanId) {
      if (price <= 0) {
        throw new BadRequestException(`Invalid price for ${billingCycle} billing`);
      }
      
      try {
        const rzpPlan = await this.razorpay.plans.create({
          period: billingCycle === 'QUARTERLY' ? 'monthly' : 'yearly',
          interval: billingCycle === 'QUARTERLY' ? 3 : 1,
          item: {
            name: `BizzRiser ${plan.name} ${billingCycle}`,
            amount: (billingCycle === 'QUARTERLY' ? price * 3 : price * 12) * 100, // paise
            currency: 'INR',
            description: `${plan.name} Plan - ${billingCycle} Subscription`
          }
        });
        
        razorpayPlanId = rzpPlan.id;
        
        // Save back to DB
        await this.prisma.package.update({
          where: { id: planId },
          data: {
            ...(billingCycle === 'QUARTERLY' ? { razorpayQuarterlyPlanId: razorpayPlanId } : {}),
            ...(billingCycle === 'YEARLY' ? { razorpayYearlyPlanId: razorpayPlanId } : {})
          }
        });
        this.logger.log(`Auto-created Razorpay plan ${razorpayPlanId} for ${plan.name} (${billingCycle})`);
      } catch (err: any) {
        this.logger.error('Failed to auto-create Razorpay plan', err);
        throw new BadRequestException(`Failed to auto-create Razorpay plan: ${err.message || 'Unknown error'}`);
      }
    }

    let offer;
    if (offerCodeStr) {
      offer = await this.offerCodesService.validate(offerCodeStr, planId);
    }

    let totalCount = 120; // 10 years monthly
    if (billingCycle === 'QUARTERLY') totalCount = 40; // 10 years quarterly
    if (billingCycle === 'YEARLY') totalCount = 10; // 10 years yearly

    const payload: any = {
      plan_id: razorpayPlanId,
      total_count: totalCount,
      customer_notify: 1,
    };

    const rzpSub = await this.razorpay.subscriptions.create(payload);

    // Store pre-org subscription with invitationEmail for finalization after payment
    await this.prisma.razorpaySubscription.create({
      data: {
        organizationId: orgId || null,
        invitationEmail,
        packageId: planId,
        razorpaySubscriptionId: rzpSub.id,
        billingCycle,
        amount: price,
        status: 'CREATED',
        offerCodeId: offer?.id,
      }
    });

    // Store pending sub ID on invitation for tracking
    await this.prisma.clientInvitation.updateMany({
      where: { email: invitationEmail },
      data: { pendingRazorpaySubId: rzpSub.id },
    });

    return { subscriptionId: rzpSub.id, shortUrl: rzpSub.short_url };
  }

  async handleWebhook(req: RawBodyRequest<Request>) {
    const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';
    const signature = req.headers['x-razorpay-signature'] as string;
    
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
    const rzpSubscription = body.payload?.subscription?.entity;
    const rzpPayment = body.payload?.payment?.entity;

    if (!rzpSubscription) return { status: 'ignored' };

    const sub = await this.prisma.razorpaySubscription.findUnique({
      where: { razorpaySubscriptionId: rzpSubscription.id }
    });

    if (!sub) {
      this.logger.warn(`[Webhook] Subscription not found for Razorpay ID: ${rzpSubscription.id}`);
      return { status: 'subscription_not_found' };
    }

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged': {
        const paymentId: string | undefined = rzpPayment?.id;

        // --- IDEMPOTENCY GUARD ---
        if (paymentId && sub.lastPaymentId === paymentId) {
          this.logger.warn(`[Webhook] Duplicate event for paymentId ${paymentId} on sub ${sub.id}. Skipping.`);
          return { status: 'duplicate_ignored' };
        }

        const nextBillingDate = rzpSubscription.current_end
          ? new Date(rzpSubscription.current_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const pkg = await this.prisma.package.findUnique({ where: { id: sub.packageId } });

        // If no org yet (pre-payment onboarding), finalize signup first
        if (!sub.organizationId && sub.invitationEmail) {
          this.logger.log(`[Webhook] No org yet for sub ${sub.id}. Calling finalizeSignup for ${sub.invitationEmail}`);
          await this.authService.finalizeSignup(sub.invitationEmail, rzpSubscription.id);
          // Re-fetch subscription after finalize linked the org
          const refreshedSub = await this.prisma.razorpaySubscription.findUnique({
            where: { razorpaySubscriptionId: rzpSubscription.id },
          });
          if (!refreshedSub?.organizationId) {
            this.logger.error(`[Webhook] finalizeSignup did not link org for sub ${sub.id}`);
            return { status: 'finalize_failed' };
          }
          // Continue with the refreshed sub
          await this.prisma.$transaction(async (tx) => {
            await tx.razorpaySubscription.update({
              where: { id: refreshedSub.id },
              data: {
                status: 'ACTIVE',
                razorpayCustomerId: rzpSubscription.customer_id,
                razorpayPaymentId: paymentId,
                lastPaymentId: paymentId,
                currentPeriodEnd: nextBillingDate,
                webhookVerified: true,
              }
            });

            await tx.organization.update({
              where: { id: refreshedSub.organizationId! },
              data: {
                subscriptionStatus: 'ACTIVE',
                billingCycle: refreshedSub.billingCycle,
                packageId: refreshedSub.packageId,
                subscriptionId: refreshedSub.id,
                subscriptionEndsAt: nextBillingDate,
                razorpayCustomerId: rzpSubscription.customer_id,
                credits: pkg?.credits && pkg.credits > 0 ? { increment: pkg.credits } : undefined,
              }
            });
          });
          break;
        }

        // Org exists — normal renewal/activation flow
        if (sub.organizationId) {
          await this.prisma.$transaction(async (tx) => {
            await tx.razorpaySubscription.update({
              where: { id: sub.id },
              data: {
                status: 'ACTIVE',
                razorpayCustomerId: rzpSubscription.customer_id,
                razorpayPaymentId: paymentId,
                lastPaymentId: paymentId,
                currentPeriodEnd: nextBillingDate,
                webhookVerified: true,
              }
            });

            await tx.organization.update({
              where: { id: sub.organizationId! },
              data: {
                subscriptionStatus: 'ACTIVE',
                billingCycle: sub.billingCycle,
                packageId: sub.packageId,
                subscriptionId: sub.id,
                subscriptionEndsAt: nextBillingDate,
                razorpayCustomerId: rzpSubscription.customer_id,
                // Only increment credits on renewals (sub was already ACTIVE)
                credits: (sub.status === 'ACTIVE' && pkg?.credits && pkg.credits > 0)
                  ? { increment: pkg.credits }
                  : undefined,
              }
            });
          });
        }
        break;
      }

      case 'subscription.payment_failed': {
        const paymentId: string | undefined = rzpPayment?.id;
        this.logger.warn(`[Webhook] Payment failed for sub ${sub.id} (email: ${sub.invitationEmail || sub.organizationId})`);
        await this.prisma.razorpaySubscription.update({
          where: { id: sub.id },
          data: {
            status: 'PAYMENT_FAILED',
            razorpayPaymentId: paymentId,
          }
        });
        // If org exists, reflect payment failure
        if (sub.organizationId) {
          await this.prisma.organization.update({
            where: { id: sub.organizationId },
            data: { subscriptionStatus: 'PAST_DUE' },
          });
        }
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.halted': {
        await this.prisma.$transaction(async (tx) => {
          await tx.razorpaySubscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELLED' }
          });

          if (sub.organizationId) {
            await tx.organization.update({
              where: { id: sub.organizationId },
              data: { subscriptionStatus: 'CANCELLED' }
            });
          }
        });
        break;
      }
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

    // Signature is valid. The webhook is the authoritative source for activating subscriptions.
    // We do NOT modify org/subscription status here to prevent double-processing.
    this.logger.log(`[verifySubscription] Signature verified for sub ${razorpaySubscriptionId}. Awaiting webhook for activation.`);
    return { success: true, message: 'Payment signature verified. Your account will be activated shortly.' };
  }

  async getSubscriptionStatus(invitationEmail: string) {
    const sub = await this.prisma.razorpaySubscription.findFirst({
      where: { invitationEmail },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { status: 'NOT_FOUND' };
    return { status: sub.status, organizationId: sub.organizationId };
  }
}
