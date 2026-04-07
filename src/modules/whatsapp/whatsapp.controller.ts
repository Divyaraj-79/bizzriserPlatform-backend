import { Controller, Post, Get, Body, UseGuards, Req, Version, Param, Patch, Delete, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@Controller({
  path: 'whatsapp',
  version: '1',
})
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * Endpoint to save WhatsApp Business Account credentials after Embedded Signup.
   */
  @Post('account')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN)
  async connectAccount(@Req() req: any, @Body() data: any) {
    return this.whatsappService.connectAccount(req.user.orgId, data);
  }

  @Get('accounts')
  async listAccounts(@Req() req: any) {
    return this.whatsappService.listAccounts(req.user.orgId);
  }

  @Get('accounts/:id/templates')
  async getTemplates(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.getTemplates(req.user.orgId, id);
  }

  @Post('accounts/:id/templates')
  async createTemplate(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return this.whatsappService.createTemplate(req.user.orgId, id, data);
  }

  @Post('accounts/:id/templates/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemplateMedia(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any
  ) {
    return this.whatsappService.uploadTemplateMedia(req.user.orgId, id, file);
  }

  @Patch('accounts/:id/templates/:templateId')
  async updateTemplate(@Req() req: any, @Param('id') id: string, @Param('templateId') templateId: string, @Body() data: any) {
    return this.whatsappService.updateTemplate(req.user.orgId, id, templateId, data);
  }

  @Delete('accounts/:id/templates/:templateName')
  async deleteTemplate(@Req() req: any, @Param('id') id: string, @Param('templateName') templateName: string) {
    return this.whatsappService.deleteTemplate(req.user.orgId, id, templateName);
  }

  @Post('sync/:id')
  async syncAccount(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.syncAccount(req.user.orgId, id);
  }

  @Post('disconnect/:id')
  async disconnectAccount(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.disconnectAccount(req.user.orgId, id);
  }

  @Get('config')
  async getSignupConfig() {
    return {
      appId: process.env.WHATSAPP_APP_ID,
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v22.0',
    };
  }
}
