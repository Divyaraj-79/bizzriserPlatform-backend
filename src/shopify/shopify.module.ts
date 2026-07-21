import { Module } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifySyncCron } from './shopify-sync.cron';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ShopifyController, ShopifyWebhookController],
  providers: [ShopifyService, ShopifySyncCron],
  exports: [ShopifyService],
})
export class ShopifyModule {}
