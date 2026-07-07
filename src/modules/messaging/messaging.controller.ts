import { Controller, Post, Get, Body, Param, UseGuards, Req, UseInterceptors, UploadedFile, Query, Delete, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as express from 'express';
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
  async getConversations(
    @Req() req: any,
    @Query('section') section?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.messagingService.getConversations(
      req.user.orgId, 
      req.user,
      section,
      page ? parseInt(page) : undefined,
      limit ? parseInt(limit) : undefined
    );
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
    @Query('search') search?: string,
  ) {
    return this.messagingService.getConversationMessages(conversationId, search);
  }

  @Get('conversations/:id/export')
  async exportChat(
    @Param('id') conversationId: string,
    @Req() req: any,
    @Res() res: express.Response,
  ) {
    const textData = await this.messagingService.exportConversationChat(req.user.orgId, conversationId);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="chat-export-${conversationId.substring(0, 8)}.txt"`);
    res.send(textData);
  }

  @Delete('conversations/:id/messages')
  async clearMessages(@Param('id') id: string, @Req() req: any) {
    return this.messagingService.clearConversationMessages(req.user.orgId, id);
  }

  @Post('conversations/:id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.messagingService.markAsRead(req.user.orgId, id);
  }
  
  @Get('media/:mediaId')
  async getMedia(
    @Param('mediaId') mediaId: string,
    @Query('accountId') accountId: string,
    @Req() req: any,
    @Res() res: express.Response,
  ) {
    const media = await this.messagingService.downloadMedia(
      req.user.orgId,
      accountId,
      mediaId,
    );
    if (!media) {
      res.status(404).send('Media not found');
      return;
    }
    res.setHeader('Content-Type', media.mimeType);
    media.stream.pipe(res);
  }

  @Get('pending-messages')
  async getPendingMessages(@Req() req: any) {
    return this.messagingService.getPendingMessages(req.user.orgId);
  }

  @Post('pending-messages/process')
  async processPendingMessages(
    @Req() req: any,
    @Body() body: { accept: boolean }
  ) {
    return this.messagingService.processPendingMessages(req.user.orgId, body.accept);
  }
}
