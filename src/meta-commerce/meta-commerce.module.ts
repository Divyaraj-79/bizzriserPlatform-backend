import { Module } from '@nestjs/common';
import { MetaCommerceController } from './meta-commerce.controller';
import { MetaCommercePublicController } from './meta-commerce-public.controller';
import { MetaCommerceService } from './meta-commerce.service';
import { PrismaService } from '../prisma/prisma.service'; // Assuming this exists
import { ChatbotsModule } from '../modules/chatbots/chatbots.module';
import { AbandonedCartCron } from './abandoned-cart.cron';

@Module({
  imports: [ChatbotsModule],
  controllers: [MetaCommerceController, MetaCommercePublicController],
  providers: [MetaCommerceService, PrismaService, AbandonedCartCron],
  exports: [MetaCommerceService],
})
export class MetaCommerceModule {}
