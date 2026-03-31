import { Controller, Get, Post, Body, UseGuards, Req, ForbiddenException, Param, Delete, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async findAll(@Req() req: any) {
    // If Super Admin, they might want all users (global), 
    // but for the Staff page we usually want the current org.
    // Our OrganizationGuard or simple logic here can handle it.
    return this.usersService.findAllByOrganization(req.user.orgId);
  }

  @Post()
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async create(@Req() req: any, @Body() createUserDto: any) {
    const currentUser = req.user;

    // RBAC: Org Admin can only create users for their own organization
    if (currentUser.role === UserRole.ORG_ADMIN) {
      createUserDto.organizationId = currentUser.orgId;
      // Org Admin cannot create Super Admins
      if (createUserDto.role === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Cannot create Super Admin');
      }
    }

    return this.usersService.create(createUserDto);
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.usersService.findOne(req.user.userId);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async remove(@Req() req: any, @Param('id') id: string) {
    // RBAC: Org Admin can only remove users from their own organization
    return this.usersService.remove(id, req.user.orgId);
  }

  @Patch(':id/role')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async updateRole(
    @Req() req: any, 
    @Param('id') id: string, 
    @Body('role') role: UserRole
  ) {
    // Business rule: Cannot set a Super Admin role unless you are one
    if (role === UserRole.SUPER_ADMIN && req.user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }

    return this.usersService.updateRole(id, req.user.orgId, role);
  }
}
