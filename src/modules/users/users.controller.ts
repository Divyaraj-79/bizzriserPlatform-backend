import { Controller, Get, Post, Body, UseGuards, Req, ForbiddenException, Param, Delete, Patch, Query, UnauthorizedException, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('view:manage-users')
  async findAll(@Req() req: any) {
    // If Super Admin, they might want all users (global), 
    // but for the Staff page we usually want the current org.
    // Our OrganizationGuard or simple logic here can handle it.
    return this.usersService.findAllByOrganization(req.user.orgId);
  }

  @Post()
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('manage:team')
  async create(@Req() req: any, @Body() createUserDto: CreateUserDto) {
    const currentUser = req.user;

    // RBAC: Ensure organizationId is assigned from the current user's context
    if (currentUser.orgId) {
      createUserDto.organizationId = currentUser.orgId;
    }

    // RBAC: Org Admin cannot create Super Admins
    if (currentUser.role === UserRole.ORG_ADMIN && createUserDto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create Super Admin');
    }

    return this.usersService.create(createUserDto);
  }

  // --- MY ACCOUNT ROUTES ---

  @Get('me')
  async getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.sub);
  }

  @Patch('me')
  async updateMe(@Req() req: any, @Body() body: any) {
    return this.usersService.updateMe(req.user.sub, body);
  }

  @Post('me/change-password')
  async changePassword(@Req() req: any, @Body() body: any) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('currentPassword and newPassword are required');
    }
    return this.usersService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyAvatar(@Req() req: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('File is required');
    return this.usersService.uploadMyAvatar(req.user.sub, file);
  }

  @Delete('me')
  async deleteMe(@Req() req: any) {
    return this.usersService.deleteMe(req.user.sub);
  }

  // --- END MY ACCOUNT ROUTES ---

  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.usersService.findOne(req.user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('manage:team')
  async updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { accountAssignments?: any[]; status?: string; firstName?: string; lastName?: string; permissions?: any; timezone?: string },
  ) {
    return this.usersService.updateUser(id, req.user.orgId, body);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('manage:team')
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

  @Get('me/permissions')
  async getMyPermissions(@Req() req: any) {
    // 1. Fetch fresh user from DB to avoid staleness in JWT
    const user = await this.usersService.findOne(req.user.sub);
    
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account has been suspended or deactivated.');
    }

    const userPermissions = user.permissions || {};
    
    // STRICT GLOBAL PERMISSIONS ONLY (Role System Removed)
    const finalPermissions: Record<string, boolean> = { ...userPermissions };
    
    // Dashboard is common to all
    finalPermissions['dashboard:view'] = true;

    return finalPermissions;
  }
}
