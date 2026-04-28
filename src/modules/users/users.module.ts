import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CustomRolesService } from './custom-roles.service';
import { CustomRolesController } from './custom-roles.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [ActivityLogsModule],
  controllers: [UsersController, CustomRolesController],
  providers: [UsersService, CustomRolesService],
  exports: [UsersService],
})
export class UsersModule {}
