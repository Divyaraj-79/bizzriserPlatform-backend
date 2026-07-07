import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CustomRolesService } from './custom-roles.service';
import { CustomRolesController } from './custom-roles.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [ActivityLogsModule, RealtimeModule],
  controllers: [UsersController, CustomRolesController],
  providers: [UsersService, CustomRolesService],
  exports: [UsersService],
})
export class UsersModule {}
