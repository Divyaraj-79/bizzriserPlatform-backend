import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [WhatsappModule, PrismaModule, RealtimeModule, ContactsModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
