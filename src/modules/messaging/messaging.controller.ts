import { Controller, Post, Get, Body, Param, UseGuards, Req, Version } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller({
  path: 'messaging',
  version: '1',
})
@UseGuards(JwtAuthGuard)
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
    return this.messagingService.getConversations(req.user.orgId);
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
