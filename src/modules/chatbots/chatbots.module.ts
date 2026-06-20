import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ChatbotsService } from './chatbots.service';
import { ChatbotsController } from './chatbots.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { FlowExecutorService } from './executor/flow-executor.service';
import { FlowDelayProcessor } from './executor/flow-delay.processor';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MessagingModule } from '../messaging/messaging.module';
import { FlowsModule } from '../flows/flows.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    WhatsappModule,
    MessagingModule,
    FlowsModule,
    RealtimeModule,
    BullModule.registerQueue({ name: 'flow-delays' }),
  ],
  controllers: [ChatbotsController],
  providers: [ChatbotsService, FlowExecutorService, FlowDelayProcessor],
  exports: [ChatbotsService, FlowExecutorService],
})
export class ChatbotsModule {}
