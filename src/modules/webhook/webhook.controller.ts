import { Controller, Post, Get, Body, Query, Headers, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Meta sends a GET request for webhook verification.
   */
  @Get()
  verify(@Query() query: any) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    this.logger.log(`Received verification request: mode=${mode}, token=${token}`);
    return this.webhookService.verifyWebhook(mode, token, challenge);
  }

  /**
   * WhatsApp sends POST requests for events (messages, status updates).
   */
  @HttpCode(HttpStatus.OK)
  @Post()
  async handleWebhook(
    @Req() req: any,
    @Headers('X-Hub-Signature-256') signature: string,
    @Body() payload: any,
  ) {
    this.logger.debug('Received webhook payload:', JSON.stringify(payload));
    return this.webhookService.handleIncomingWebhook(signature, payload, req.rawBody);
  }
}
