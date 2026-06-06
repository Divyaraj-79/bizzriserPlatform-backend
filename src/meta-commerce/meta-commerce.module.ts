import { Module } from '@nestjs/common';
import { MetaCommerceController } from './meta-commerce.controller';
import { MetaCommercePublicController } from './meta-commerce-public.controller';
import { MetaCommerceService } from './meta-commerce.service';
import { PrismaService } from '../prisma/prisma.service'; // Assuming this exists

@Module({
  controllers: [MetaCommerceController, MetaCommercePublicController],
  providers: [MetaCommerceService, PrismaService],
  exports: [MetaCommerceService],
})
export class MetaCommerceModule {}
