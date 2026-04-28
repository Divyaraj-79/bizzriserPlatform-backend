import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  async create(@Req() req: any, @Body() data: { name: string; type?: string; isRequired?: boolean }) {
    console.log('[CustomFieldsController] Creating field:', { orgId: req.user?.orgId, userId: req.user?.userId, data });
    return this.customFieldsService.create(req.user.orgId, data);
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.customFieldsService.findAll(req.user.orgId);
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.customFieldsService.delete(req.user.orgId, id);
  }
}
