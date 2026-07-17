import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [CheckoutController],
  providers: [CheckoutService]
})
export class CheckoutModule {}
