import { Controller, Post, Get, Body, Param, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WhatsAppAccountGuard } from '../../common/guards/whatsapp-account.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller({
  path: 'messaging',
  version: '1',
})
@UseGuards(JwtAuthGuard, RolesGuard, WhatsAppAccountGuard)
@Permissions('view:chat')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('send')
  async sendMessage(
    @Req() req: any,
    @Body() body: { accountId: string; contactId: string; text: string }
  ) {
    return this.messagingService.sendTextMessage(
      req.user.orgId,
      body.accountId,
      body.contactId,
      body.text,
    );
  }

  @Post('send-media')
  @UseInterceptors(FileInterceptor('file'))
  async sendMedia(
    @Req() req: any,
    @Body() body: { accountId: string; contactId: string; caption?: string },
    @UploadedFile() file: any,
  ) {
    return this.messagingService.sendMediaMessage(
      req.user.orgId,
      body.accountId,
      body.contactId,
      file,
      body.caption,
    );
  }

  @Post('template')
  async sendTemplate(
    @Req() req: any,
    @Body() body: { accountId: string; contactId: string; templateName: string; language?: string; components?: any[] }
  ) {
    return this.messagingService.sendTemplateMessage(
      req.user.orgId,
      body.accountId,
      body.contactId,
      body.templateName,
      body.language || 'en_US',
      body.components || [],
    );
  }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.messagingService.getConversations(req.user.orgId, req.user);
  }

  @Post('conversations')
  async createConversation(
    @Req() req: any,
    @Body() body: { whatsappAccountId: string; phoneNumber: string; firstName?: string; lastName?: string }
  ) {
    return this.messagingService.startNewConversation(
      req.user.orgId,
      body.whatsappAccountId,
      body.phoneNumber,
      { firstName: body.firstName, lastName: body.lastName }
    );
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @Req() req: any,
  ) {
    // Basic validation that conversation belongs to organization could be added here
    // For now, simple retrieval
    return this.messagingService.getConversationMessages(conversationId);
  }
}
