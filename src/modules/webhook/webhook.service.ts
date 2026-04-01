import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookEventType } from '@prisma/client';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue('webhooks') private readonly webhookQueue: Queue,
  ) {}

  /**
   * Verifies the webhook during Meta's setup process.
   */
  verifyWebhook(mode: string, token: string, challenge: string): string {
    const verifyToken = this.config.get<string>('whatsapp.verifyToken');

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log(`Webhook verified successfully. Returning challenge: ${challenge}`);
      return challenge;
    }

    this.logger.error('Webhook verification failed: Invalid verify token');
    throw new UnauthorizedException('Invalid verification token');
  }

  async handleIncomingWebhook(signature: string, payload: any, rawBody?: Buffer) {
    // 1. Validate signature using the raw body for 100% accuracy
    this.validateSignature(signature, payload, rawBody);

    // 2. Identify event type and organization
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        // A. Handle standard message events
        if (change.field === 'messages') {
          await this.processMessageEvent(entry.id, change.value);
        }
        
        // B. Handle partner installation events (Automated Account Link Fallback)
        if (change.field === 'account_update' && change.value?.event === 'PARTNER_APP_INSTALLED') {
          const wabaId = change.value?.waba_info?.waba_id;
          if (wabaId) {
            this.logger.log(`Detected WABA installation via webhook: ${wabaId}`);
            const firstOrg = await this.prisma.organization.findFirst();
            if (firstOrg) {
              await this.prisma.webhookEvent.create({
                data: {
                  organizationId: firstOrg.id,
                  eventType: WebhookEventType.MESSAGE_RECEIVED, // Existing type to avoid DB error
                  payload: {
                    ...change.value,
                    isSignupEvent: true,
                  },
                }
              });
            }
          }
        }
      }
    }

    return { status: 'received' };
  }

  /**
   * Validates the X-Hub-Signature-256 header.
   */
  private validateSignature(signature: string, payload: any, rawBody?: Buffer) {
    if (!signature) {
      this.logger.error('Missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing signature');
    }

    const appSecret = this.config.get<string>('whatsapp.appSecret');
    if (!appSecret) {
      throw new Error('WHATSAPP_APP_SECRET is not configured');
    }

    // IMPORTANT: Meta's signature is calculated based on the EXACT raw bytes of the request.
    // Using JSON.stringify(payload) is unreliable because it can change formatting.
    if (!rawBody) {
      this.logger.error('Missing rawBody for signature validation. Check NestJS bootstrap config.');
      throw new Error('Internal validation error');
    }

    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const incomingHash = signature.split('=')[1];
    if (incomingHash !== expectedSignature) {
      this.logger.error(`Signature mismatch! Incoming: ${incomingHash}, Expected: ${expectedSignature}`);
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.debug('Webhook signature verified successfully');
  }

  /**
   * Process message-related events and enqueue them.
   */
  private async processMessageEvent(wabaId: string, value: any) {
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    // Find the WhatsApp account associated with this phone number ID
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { phoneNumberId },
      select: { id: true, organizationId: true },
    });

    if (!account) {
      this.logger.warn(`No account found for phone_number_id: ${phoneNumberId}`);
      return;
    }

    // Save the raw event for audit/retry
    const event = await this.prisma.webhookEvent.create({
      data: {
        organizationId: account.organizationId,
        eventType: WebhookEventType.MESSAGE_RECEIVED,
        payload: value,
      },
    });

    // Enqueue for background processing
    await this.webhookQueue.add('process-message', {
      eventId: event.id,
      accountId: account.id,
      organizationId: account.organizationId,
      data: value,
    });
  }
}
