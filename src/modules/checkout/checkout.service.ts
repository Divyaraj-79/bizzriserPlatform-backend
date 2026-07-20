import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FlowExecutorService } from '../chatbots/executor/flow-executor.service';
import * as crypto from 'crypto';
import Stripe from 'stripe';
import Razorpay from 'razorpay';

@Injectable()
export class CheckoutService {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    private flowExecutor: FlowExecutorService,
  ) {}

  async getOrderDetails(orderId: string) {
    const order = await this.prisma.catalogOrder.findFirst({
      where: { 
        OR: [
          { id: orderId },
          { orderUniqueId: orderId }
        ]
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId: order.organizationId },
      orderBy: { updatedAt: 'desc' }
    });

    const settings = (catalog?.settings as any) || {};
    const paymentSettings = settings.paymentSettings || {};
    
    // Clean up sensitive keys from gateways before returning
    const gateways = paymentSettings.gateways || {};
    const safeGateways: any = {};
    for (const key of Object.keys(gateways)) {
      if (gateways[key]?.active) {
        safeGateways[key] = {
          name: key,
          clientId: gateways[key].clientId, // public key
          sandbox: gateways[key].sandbox
        };
      }
    }

    return {
      order: {
        id: order.id,
        orderUniqueId: order.orderUniqueId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        metadata: order.metadata,
        buyerName: order.buyerName,
        buyerPhone: order.buyerPhone
      },
      settings: {
        currency: paymentSettings.currency || order.currency,
        currencyPosition: paymentSettings.currencyPosition || 'Left',
        decimalPlace: paymentSettings.decimalPlace || '2',
        thousandComma: paymentSettings.thousandComma !== false
      },
      gateways: safeGateways
    };
  }

  async createPaymentSession(orderId: string, gateway: string) {
    const order = await this.prisma.catalogOrder.findFirst({
      where: { 
        OR: [
          { id: orderId },
          { orderUniqueId: orderId }
        ]
      }
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'PAID') throw new BadRequestException('Order is already paid');

    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId: order.organizationId }
    });

    const settings = (catalog?.settings as any) || {};
    const paymentSettings = settings.paymentSettings || {};
    const gatewayConfig = paymentSettings.gateways?.[gateway];

    if (!gatewayConfig || !gatewayConfig.active) {
      throw new BadRequestException(`Payment gateway ${gateway} is not active or configured`);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const amount = Math.round((order.amount || 0) * 100); // converting to smallest currency unit (cents/paise)

    if (gateway === 'Stripe') {
      if (!gatewayConfig.secret) throw new BadRequestException('Stripe secret key missing');
      const stripe = new Stripe(gatewayConfig.secret, { apiVersion: '2024-06-20' as any });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: order.currency || 'USD',
              product_data: {
                name: `Order ${order.orderUniqueId}`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${frontendUrl}/checkout/${orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/checkout/${orderId}`,
        metadata: {
          orderId: order.id
        }
      });

      return { type: 'stripe', url: session.url };
    } 
    else if (gateway === 'Razorpay') {
      if (!gatewayConfig.clientId || !gatewayConfig.secret) {
        throw new BadRequestException('Razorpay credentials missing');
      }

      const razorpay = new Razorpay({
        key_id: gatewayConfig.clientId,
        key_secret: gatewayConfig.secret,
      });

      const options = {
        amount,
        currency: order.currency || 'INR',
        receipt: order.id,
      };

      try {
        const rpOrder = await razorpay.orders.create(options);
        return { 
          type: 'razorpay', 
          orderId: rpOrder.id, 
          amount: rpOrder.amount,
          currency: rpOrder.currency,
          key: gatewayConfig.clientId
        };
      } catch (err: any) {
        throw new BadRequestException(err.message || 'Failed to create Razorpay order');
      }
    }

    throw new BadRequestException('Unsupported gateway');
  }

  async verifyRazorpay(orderId: string, razorpayPaymentId: string, razorpayOrderId: string, razorpaySignature: string) {
    const order = await this.prisma.catalogOrder.findFirst({
      where: { 
        OR: [
          { id: orderId },
          { orderUniqueId: orderId }
        ]
      }
    });
    if (!order) throw new NotFoundException('Order not found');

    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId: order.organizationId }
    });

    const settings = (catalog?.settings as any) || {};
    const gatewayConfig = settings.paymentSettings?.gateways?.Razorpay;

    if (!gatewayConfig || !gatewayConfig.secret) {
      throw new BadRequestException('Razorpay config missing');
    }

    const generatedSignature = crypto
      .createHmac('sha256', gatewayConfig.secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      throw new BadRequestException('Invalid signature');
    }

    await this.markOrderAsPaid(order.id, order.organizationId, catalog?.settings);
    return { success: true };
  }

  async verifyStripe(orderId: string, sessionId: string) {
    const order = await this.prisma.catalogOrder.findFirst({
      where: { 
        OR: [
          { id: orderId },
          { orderUniqueId: orderId }
        ]
      }
    });
    if (!order) throw new NotFoundException('Order not found');

    const catalog = await this.prisma.metaCatalog.findFirst({
      where: { organizationId: order.organizationId }
    });

    const settings = (catalog?.settings as any) || {};
    const gatewayConfig = settings.paymentSettings?.gateways?.Stripe;

    if (!gatewayConfig || !gatewayConfig.secret) {
      throw new BadRequestException('Stripe config missing');
    }

    const stripe = new Stripe(gatewayConfig.secret, { apiVersion: '2024-06-20' as any });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      await this.markOrderAsPaid(order.id, order.organizationId, catalog?.settings);
      return { success: true };
    }

    throw new BadRequestException('Payment not completed');
  }

  private async markOrderAsPaid(orderId: string, organizationId: string, catalogSettings: any) {
    const order = await this.prisma.catalogOrder.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED' }
    });

    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { organizationId }
    });

    if (account && order.buyerPhone) {
      // Find the predefined ORDER_CONFIRMED chatbot
      const systemBot = await this.prisma.chatbot.findFirst({
        where: { organizationId, systemEvent: 'ORDER_CONFIRMED', status: 'ACTIVE' }
      });

      if (systemBot) {
        // Trigger the flow
        const contact = await this.prisma.contact.findFirst({
          where: { organizationId, phone: order.buyerPhone }
        });
        
        if (contact) {
          const initialVars = {
            orderId: order.orderUniqueId,
            currency: order.currency,
            totalAmount: order.amount?.toString() || '0'
          };
          
          await this.flowExecutor.startSession(
            organizationId, 
            account.id, 
            systemBot, 
            contact, 
            { text: { body: '' } }, // Dummy message data
            initialVars
          );
        }
      } else {
        // Fallback simple message if bot not found or active
        const msg = `Hi ${order.buyerName || 'there'},\n\nWe have successfully received your payment of ${order.currency} ${order.amount} for Order ${order.orderUniqueId}!\n\nThank you for shopping with us!`;
        try {
          await this.whatsappService.sendTextMessage(organizationId, account.id, order.buyerPhone, msg);
        } catch (e) {
          console.error('Failed to send success message:', e);
        }
      }
    }
  }
}
