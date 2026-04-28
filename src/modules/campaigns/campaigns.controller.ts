import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WhatsAppAccountGuard } from '../../common/guards/whatsapp-account.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard, WhatsAppAccountGuard)
@Permissions('view:campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async findAll(
    @Req() req: any,
    @Query('accountId') accountId?: string
  ) {
    return this.campaignsService.findAll(req.user.orgId, accountId || req.allowedAccountIds);
  }

  @Post('broadcast')
  async createBroadcast(
    @Req() req: any,
    @Body() data: any,
  ) {
    return this.campaignsService.createBroadcast(req.user.orgId, data);
  }

  @Post(':id/cancel')
  async cancelBroadcast(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.campaignsService.cancelCampaign(req.user.orgId, id);
  }

  @Get(':id')
  async getCampaign(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.campaignsService.getCampaign(req.user.orgId, id);
  }

  @Delete(':id')
  async deleteCampaign(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.campaignsService.deleteCampaign(req.user.orgId, id);
  }

  @Get(':id/export')
  async exportCampaign(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.campaignsService.getExportData(req.user.orgId, id);
  }
}
