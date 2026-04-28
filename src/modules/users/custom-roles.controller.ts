import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CustomRolesService } from './custom-roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

@Controller('custom-roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CustomRolesController {
  constructor(private readonly customRolesService: CustomRolesService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('manage:team')
  async findAll(@Req() req: any) {
    return this.customRolesService.findAll(req.user.orgId);
  }

  @Post()
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('manage:team')
  async create(@Req() req: any, @Body() data: { name: string; permissions: any }) {
    return this.customRolesService.create(req.user.orgId, data);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('manage:team')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.customRolesService.remove(id, req.user.orgId);
  }
}
