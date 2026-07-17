import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

@Controller('public/checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get(':orderId')
  async getOrderDetails(@Param('orderId') orderId: string) {
    return this.checkoutService.getOrderDetails(orderId);
  }

  @Post(':orderId/pay')
  async createPaymentSession(
    @Param('orderId') orderId: string,
    @Body('gateway') gateway: string
  ) {
    return this.checkoutService.createPaymentSession(orderId, gateway);
  }

  @Post(':orderId/verify-razorpay')
  async verifyRazorpay(
    @Param('orderId') orderId: string,
    @Body() body: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }
  ) {
    return this.checkoutService.verifyRazorpay(
      orderId,
      body.razorpay_payment_id,
      body.razorpay_order_id,
      body.razorpay_signature
    );
  }

  @Post(':orderId/verify-stripe')
  async verifyStripe(
    @Param('orderId') orderId: string,
    @Body('session_id') sessionId: string
  ) {
    return this.checkoutService.verifyStripe(orderId, sessionId);
  }
}
