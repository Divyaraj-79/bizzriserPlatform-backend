import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ChatbotsService } from './chatbots.service';
import { ChatbotsController } from './chatbots.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { FlowExecutorService } from './executor/flow-executor.service';
import { FlowDelayProcessor } from './executor/flow-delay.processor';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    PrismaModule,
    WhatsappModule,
    BullModule.registerQueue({ name: 'flow-delays' }),
  ],
  controllers: [ChatbotsController],
  providers: [ChatbotsService, FlowExecutorService, FlowDelayProcessor],
  exports: [ChatbotsService, FlowExecutorService],
})
export class ChatbotsModule {}
