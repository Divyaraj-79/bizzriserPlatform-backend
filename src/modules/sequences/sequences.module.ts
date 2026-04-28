import { Module } from '@nestjs/common';
import { SequencesController } from './sequences.controller';
import { SequencesService } from './sequences.service';
import { SequenceExecutorService } from './sequence-executor.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { BullModule } from '@nestjs/bull';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    PrismaModule,
    WhatsappModule,
    BullModule.registerQueue({
      name: 'sequences',
    }),
  ],
  controllers: [SequencesController],
  providers: [SequencesService, SequenceExecutorService],
  exports: [SequencesService],
})
export class SequencesModule {}
