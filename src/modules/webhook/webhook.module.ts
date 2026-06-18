import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';
import { ContactsModule } from '../contacts/contacts.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ChatbotsModule } from '../chatbots/chatbots.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhooks',
      settings: {
        stalledInterval: 5000,   // Check for stalled jobs every 5s (default: 30s)
        lockDuration: 15000,     // Keep job locked for 15s max (default: 30s)
        lockRenewTime: 7500,     // Renew lock at half-duration
        maxStalledCount: 1,      // Fail fast on stall rather than retrying forever
      },
    }),
    ContactsModule,
    MessagingModule,
    ChatbotsModule,
    WhatsappModule,
    RealtimeModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
