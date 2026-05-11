import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Req, Query, Res } from '@nestjs/common';
import { WhatsAppFlowsService } from './whatsapp-flows.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller({
  path: 'flows',
  version: '1',
})
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppFlowsController {
  constructor(private readonly flowsService: WhatsAppFlowsService) {}

  @Post()
  @Permissions('manage:flows')
  async createFlow(@Req() req: any, @Body() body: { name: string; description?: string; categories?: string[] }) {
    return this.flowsService.createFlow(req.user.orgId, body);
  }

  @Get()
  @Permissions('view:flows')
  async listFlows(@Req() req: any) {
    return this.flowsService.listFlows(req.user.orgId);
  }

  @Get(':id')
  @Permissions('view:flows')
  async getFlow(@Req() req: any, @Param('id') id: string) {
    return this.flowsService.getFlow(req.user.orgId, id);
  }

  @Put(':id')
  @Permissions('manage:flows')
  async updateFlow(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.flowsService.updateFlow(req.user.orgId, id, body);
  }

  @Delete(':id')
  @Permissions('manage:flows')
  async deleteFlow(@Req() req: any, @Param('id') id: string) {
    return this.flowsService.deleteFlow(req.user.orgId, id);
  }

  @Get(':id/submissions')
  @Permissions('view:flows')
  async getSubmissions(@Req() req: any, @Param('id') id: string) {
    return this.flowsService.getSubmissions(req.user.orgId, id);
  }

  @Get(':id/export')
  @Permissions('view:flows')
  async exportFlow(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const buffer = await this.flowsService.exportSubmissionsToExcel(req.user.orgId, id);
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="flow-submissions-${id}.xlsx"`,
      'Content-Length': buffer.byteLength,
    });

    res.end(buffer);
  }

  @Post(':id/publish')
  @Permissions('manage:flows')
  async publishFlow(@Req() req: any, @Param('id') id: string, @Body() body: { accountId: string }) {
    return this.flowsService.publishFlow(req.user.orgId, id, body.accountId);
  }
}
