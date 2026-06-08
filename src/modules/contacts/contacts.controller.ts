import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, NotFoundException, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permissions('view:contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  async create(@Req() req: any, @Body() data: any) {
    return this.contactsService.createOrUpdate(req.user.orgId, data.phone, data);
  }

  @Post('bulk')
  async bulkCreate(@Req() req: any, @Body() data: { contacts: any[] }) {
    return this.contactsService.bulkCreateOrUpdate(req.user.orgId, data.contacts);
  }

  @Get()
  async findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tag') tag?: string,
  ) {
    // RESILIENT ORG ID: If req.user.orgId is missing, try to get it from the DB
    let effectiveOrgId = req.user.orgId;
    if (!effectiveOrgId && req.user.userId) {
      try {
        const fullUser = await (this.contactsService as any).prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { organizationId: true, role: true }
        });
        effectiveOrgId = fullUser?.organizationId;
      } catch (e) {}
    }

    let result = await this.contactsService.findAll(effectiveOrgId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
      status,
      tag,
    });

    // FINAL EMERGENCY BYPASS: 
    // If 0 contacts found for a SuperAdmin, we FORCE visibility of all platform contacts.
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'superadmin';
    
    if (result.total === 0 && isSuperAdmin) {
      const globalResults = await this.contactsService.findAll(undefined as any, {
         page: page ? parseInt(page, 10) : 1,
         limit: limit ? parseInt(limit, 10) : 50,
         search,
         status,
         tag,
      });

      result = {
        ...globalResults,
        globalCount: globalResults.total
      } as any;
    }

    return result;
  }

  @Get('export')
  async exportContacts(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tag') tag?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    let effectiveOrgId = req.user.orgId;
    if (!effectiveOrgId && req.user.userId) {
      try {
        const fullUser = await (this.contactsService as any).prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { organizationId: true }
        });
        effectiveOrgId = fullUser?.organizationId;
      } catch (e) {}
    }

    return this.contactsService.exportContacts(effectiveOrgId, {
      search,
      status,
      tag,
      startDate,
      endDate
    });
  }

  @Get('tags')
  async getTagsAnalytics(
    @Req() req: any,
    @Query('includeSystem') includeSystem?: string
  ) {
    return this.contactsService.getTagsAnalytics(req.user.orgId, includeSystem === 'true');
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.contactsService.findOne(req.user.orgId, id);
  }

  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: any
  ) {
    return this.contactsService.uploadAvatar(req.user.orgId, id, file);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return this.contactsService.updateContact(req.user.orgId, id, data);
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
    @Body() body: { contactIds?: string[], tag?: string, untagged?: boolean }
  ) {
    if (body.tag) {
      return this.contactsService.deleteContactsByTag(req.user.orgId, body.tag);
    }
    if (body.untagged) {
      return this.contactsService.deleteUntaggedContacts(req.user.orgId);
    }
    return this.contactsService.deleteContacts(req.user.orgId, body.contactIds || []);
  }

  @Get('import/status/:jobId')
  async getImportStatus(@Param('jobId') jobId: string) {
    return this.contactsService.getImportStatus(jobId);
  }
}
