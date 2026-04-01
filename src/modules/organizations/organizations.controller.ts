import { Controller, Get, Post, Body, UseGuards, Req, Param, Patch, Delete } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  async findAll() {
    return this.orgsService.findAll();
  }

  @Post('onboard')
  @Roles(UserRole.SUPER_ADMIN)
  async onboard(
    @Body('organization') orgData: any,
    @Body('admin') adminData: { email: string; firstName: string; lastName: string; password?: string }
  ) {
    return this.orgsService.createWithAdmin(orgData, adminData);
  }

  @Get(':id')
  async findOne(@Req() req: any) {
    return this.orgsService.findOne(req.params.id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() updateData: any) {
    return this.orgsService.update(id, updateData);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id') id: string) {
    return this.orgsService.delete(id);
  }
}
