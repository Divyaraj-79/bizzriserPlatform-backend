import { Module } from '@nestjs/common';
import { WhatsAppFlowsService } from './whatsapp-flows.service';
import { WhatsAppFlowsController } from './whatsapp-flows.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [WhatsAppFlowsController],
  providers: [WhatsAppFlowsService],
  exports: [WhatsAppFlowsService],
})
export class FlowsModule {}
