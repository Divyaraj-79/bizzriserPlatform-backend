import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.contactsService.findAll(req.user.orgId);
  }

  @Get('tags')
  async getTagsAnalytics(@Req() req: any) {
    return this.contactsService.getTagsAnalytics(req.user.orgId);
  }

  @Post('bulk-tags')
  async bulkAddTags(
    @Req() req: any,
    @Body() body: { contactIds: string[], tags: string[] }
  ) {
    return this.contactsService.bulkAddTags(req.user.orgId, body.contactIds, body.tags);
  }

  @Delete('bulk-remove-tags')
  async bulkRemoveTags(
    @Req() req: any,
    @Body() body: { contactIds: string[], tags: string[] }
  ) {
    return this.contactsService.bulkRemoveTags(req.user.orgId, body.contactIds, body.tags);
  }

  @Delete('bulk-delete')
  async bulkDelete(
    @Req() req: any,
    @Body() body: { contactIds: string[] }
  ) {
    return this.contactsService.deleteContacts(req.user.orgId, body.contactIds);
  }
}
