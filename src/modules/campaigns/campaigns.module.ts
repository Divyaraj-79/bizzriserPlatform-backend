import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CampaignsService } from './campaigns.service';
import { CampaignProcessor } from './campaign.processor';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContactsModule } from '../contacts/contacts.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CampaignsController } from './campaigns.controller';


@Module({
  imports: [
    BullModule.registerQueue({
      name: 'campaign-messages',
    }),
    MessagingModule,
    PrismaModule,
    ContactsModule,
    RealtimeModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
