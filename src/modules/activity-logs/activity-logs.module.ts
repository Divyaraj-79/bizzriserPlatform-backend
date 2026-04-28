import { Module } from '@nestjs/common';
import { ActivityLoggerService } from './activity-logger.service';
import { ActivityLogsController } from './activity-logs.controller';

@Module({
  providers: [ActivityLoggerService],
  controllers: [ActivityLogsController],
  exports: [ActivityLoggerService],
})
export class ActivityLogsModule {}
