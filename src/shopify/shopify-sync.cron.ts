import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyService } from './shopify.service';

@Injectable()
export class ShopifySyncCron {
  private readonly logger = new Logger(ShopifySyncCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyService: ShopifyService,
  ) {}

  // Run every 30 minutes to catch any missed webhooks
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handlePeriodicSync() {
    this.logger.log('Starting periodic Shopify sync...');
    try {
      const connections = await this.prisma.shopifyConnection.findMany({
        where: { syncEnabled: true },
      });

      for (const conn of connections) {
        try {
          await this.shopifyService.syncProducts(conn.organizationId);
          await this.shopifyService.syncOrders(conn.organizationId, 1); // Sync last 1 day of orders to catch up
        } catch (error: any) {
          this.logger.error(`Failed to sync Shopify data for org ${conn.organizationId}: ${error.message}`);
        }
      }
      this.logger.log('Periodic Shopify sync completed.');
    } catch (error: any) {
      this.logger.error(`Error in Shopify sync cron: ${error.message}`);
    }
  }
}
