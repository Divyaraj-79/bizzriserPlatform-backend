import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FlowExecutorService } from '../modules/chatbots/executor/flow-executor.service';

@Injectable()
export class AbandonedCartCron {
  private readonly logger = new Logger(AbandonedCartCron.name);

  constructor(
    private prisma: PrismaService,
    private flowExecutor: FlowExecutorService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAbandonedCarts() {
    this.logger.debug('Checking for abandoned carts...');
    
    // Find all pending orders that haven't received a reminder
    const pendingOrders = await this.prisma.catalogOrder.findMany({
      where: {
        status: 'PENDING',
        reminderSentAt: null,
      },
      include: {
        organization: true
      }
    });

    for (const order of pendingOrders) {
      if (!order.buyerPhone) continue;

      // Get catalog settings for this order to find the reminder time
      const catalog = await this.prisma.metaCatalog.findFirst({
        where: { metaCatalogId: order.catalogId, organizationId: order.organizationId }
      });

      if (!catalog) continue;

      const settings: any = catalog.settings || {};
      const cartSettings = settings.cartSettings || {};
      const reminderMinutes = parseInt(cartSettings.sendReminderAfter) || 60;

      // Check if enough time has passed
      const orderAgeMinutes = (new Date().getTime() - order.createdAt.getTime()) / (1000 * 60);
      
      if (orderAgeMinutes >= reminderMinutes) {
        try {
          const systemBot = await this.prisma.chatbot.findFirst({
            where: { organizationId: order.organizationId, systemEvent: 'ABANDONED_CART', status: 'ACTIVE' }
          });

          if (systemBot) {
            const account = await this.prisma.whatsAppAccount.findFirst({
              where: { organizationId: order.organizationId }
            });
            
            const contact = await this.prisma.contact.findFirst({
              where: { organizationId: order.organizationId, phone: order.buyerPhone }
            });

            if (account && contact) {
              this.logger.log(`Sending abandoned cart reminder for order ${order.orderUniqueId}`);
              
              let formattedProducts = '';
              if (order.metadata && (order.metadata as any).items) {
                (order.metadata as any).items.forEach((item: any) => {
                  const sym = item.currency === 'INR' ? '₹' : (item.currency === 'USD' ? '$' : item.currency + ' ');
                  formattedProducts += `- ${item.quantity}x ${item.product_retailer_id} (Price: ${sym}${item.item_price})\n`;
                });
              }

              const initialVars = {
                orderId: order.orderUniqueId,
                currency: order.currency,
                totalAmount: order.amount?.toString() || '0',
                products: formattedProducts.trim()
              };

              await this.flowExecutor.startSession(
                order.organizationId, 
                account.id, 
                systemBot, 
                contact, 
                { text: { body: '' } },
                initialVars
              );
            }
          }
        } catch (error) {
          this.logger.error(`Failed to send abandoned cart reminder for ${order.orderUniqueId}`, error);
        } finally {
          // Always mark as checked so we don't infinitely retry it every 5 minutes
          await this.prisma.catalogOrder.update({
            where: { id: order.id },
            data: { reminderSentAt: new Date() }
          });
        }
      }
    }
  }
}
