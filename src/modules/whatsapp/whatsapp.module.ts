import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { SecurityService } from '../../common/services/security.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, SecurityService],
  exports: [WhatsappService, SecurityService],
})
export class WhatsappModule {}
