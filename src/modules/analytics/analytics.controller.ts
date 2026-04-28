import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WhatsAppAccountGuard } from '../../common/guards/whatsapp-account.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard, WhatsAppAccountGuard)
@Permissions('view:analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(
    @Request() req: any,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getOverview(
      req.user.orgId, 
      query.accountId || req.allowedAccountIds,
      query.startDate, 
      query.endDate
    );
  }

  @Get('campaigns')
  async getCampaigns(
    @Request() req: any,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getCampaignsAnalytics(
      req.user.orgId, 
      query.accountId || req.allowedAccountIds,
      query.startDate, 
      query.endDate
    );
  }

  @Get('export')
  async exportData(
    @Request() req: any,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getExportData(
      req.user.orgId, 
      query.accountId || req.allowedAccountIds,
      query.startDate, 
      query.endDate
    );
  }
}
