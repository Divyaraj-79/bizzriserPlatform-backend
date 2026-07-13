import { Module } from '@nestjs/common';
import { RazorpayService } from './razorpay.service';
import { RazorpayController } from './razorpay.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { OfferCodesModule } from '../offer-codes/offer-codes.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, OfferCodesModule, AuthModule],
  controllers: [RazorpayController],
  providers: [RazorpayService],
  exports: [RazorpayService]
})
export class RazorpayModule {}
