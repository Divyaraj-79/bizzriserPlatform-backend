import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ContactNotesService } from './contact-notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('contacts/:contactId/notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permissions('view:contacts')
export class ContactNotesController {
  constructor(private readonly contactNotesService: ContactNotesService) {}

  @Get()
  async findAll(@Req() req: any, @Param('contactId') contactId: string) {
    return this.contactNotesService.findAll(req.user.orgId, contactId);
  }

  @Post()
  async create(
    @Req() req: any,
    @Param('contactId') contactId: string,
    @Body('body') body: string
  ) {
    return this.contactNotesService.create(req.user.orgId, contactId, req.user.userId, body);
  }

  @Patch(':noteId')
  async update(
    @Req() req: any,
    @Param('noteId') noteId: string,
    @Body('body') body: string
  ) {
    return this.contactNotesService.update(req.user.orgId, noteId, body);
  }

  @Delete(':noteId')
  async remove(@Req() req: any, @Param('noteId') noteId: string) {
    return this.contactNotesService.remove(req.user.orgId, noteId);
  }
}
