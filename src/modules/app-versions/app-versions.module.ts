import { Module } from '@nestjs/common';
import { AppVersionsService } from './app-versions.service';
import { AppVersionsController } from './app-versions.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AppVersionsController],
  providers: [AppVersionsService],
  exports: [AppVersionsService],
})
export class AppVersionsModule {}
