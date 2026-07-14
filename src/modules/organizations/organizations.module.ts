import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { TrialCronService } from './trial-cron.service';

@Module({
  imports: [RealtimeModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TrialCronService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
