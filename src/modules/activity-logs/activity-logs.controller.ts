import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ActivityLoggerService } from './activity-logger.service';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ActivityLogsController {
  constructor(private readonly activityLoggerService: ActivityLoggerService) {}

  @Get()
  @Permissions('view:activity-logs')
  async findAll(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('userId') userId?: string,
  ) {
    return this.activityLoggerService.findAllByOrganization(req.user.orgId, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      userId,
    });
  }
}
