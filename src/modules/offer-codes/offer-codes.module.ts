import { Module } from '@nestjs/common';
import { OfferCodesService } from './offer-codes.service';
import { OfferCodesController } from './offer-codes.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OfferCodesController],
  providers: [OfferCodesService],
  exports: [OfferCodesService]
})
export class OfferCodesModule {}
