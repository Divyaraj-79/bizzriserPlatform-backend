import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';
import { ContactsModule } from '../contacts/contacts.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ChatbotsModule } from '../chatbots/chatbots.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhooks',
    }),
    ContactsModule,
    MessagingModule,
    ChatbotsModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
