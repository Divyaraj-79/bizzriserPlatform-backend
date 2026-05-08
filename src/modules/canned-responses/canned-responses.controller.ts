import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CannedResponsesService } from './canned-responses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('canned-responses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permissions('view:chat')
export class CannedResponsesController {
  constructor(private readonly cannedResponsesService: CannedResponsesService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.cannedResponsesService.findAll(req.user.orgId);
  }

  @Post()
  async create(@Req() req: any, @Body() data: { shortcut: string; body: string }) {
    return this.cannedResponsesService.create(req.user.orgId, data);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: { shortcut?: string; body?: string }
  ) {
    return this.cannedResponsesService.update(req.user.orgId, id, data);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.cannedResponsesService.remove(req.user.orgId, id);
  }
}
