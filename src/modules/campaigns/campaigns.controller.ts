import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  async create(@Req() req: any, @Body() data: any) {
    return this.campaignsService.create(req.user.orgId, data);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.campaignsService.getCampaign(req.user.orgId, id);
  }

  @Post(':id/recipients')
  async addRecipients(@Req() req: any, @Param('id') id: string, @Body('contactIds') contactIds: string[]) {
    return this.campaignsService.addRecipients(req.user.orgId, id, contactIds);
  }

  @Post(':id/start')
  async start(@Req() req: any, @Param('id') id: string, @Body('accountId') accountId: string) {
    return this.campaignsService.startCampaign(req.user.orgId, id, accountId);
  }
}
