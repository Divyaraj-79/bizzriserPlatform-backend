import { Controller, Post, Headers, Req, Res, HttpStatus } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import type { Request, Response } from 'express';

@Controller('shopify/webhook')
export class ShopifyWebhookController {
  constructor(private readonly shopifyService: ShopifyService) {}

  @Post()
  async handleWebhook(
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Req() req: Request & { rawBody: Buffer },
    @Res() res: Response,
  ) {
    // Acknowledge receipt immediately
    res.status(HttpStatus.OK).send('OK');

    if (!topic || !shopDomain || !hmac || !req.rawBody) {
      return;
    }

    // Process webhook asynchronously
    this.shopifyService
      .verifyAndHandleWebhook(shopDomain, topic, req.rawBody, hmac)
      .catch((err) => {
        console.error(`Error processing Shopify webhook ${topic} for ${shopDomain}:`, err);
      });
  }
}
