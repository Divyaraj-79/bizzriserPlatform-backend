import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!requiredPermissions || requiredPermissions.length === 0) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const jwtUser = request.user;

      if (!jwtUser) return false;

      // 1. Fetch FRESH user data from DB (JWT might be stale)
      const user = await this.prisma.user.findUnique({
        where: { id: jwtUser.sub },
        select: { role: true, permissions: true } 
      });

      if (!user) return false;
      // Re-attach ID for the rest of the guard logic
      (user as any).sub = jwtUser.sub;

      // Super Admin has all permissions bypass
      if (user.role === UserRole.SUPER_ADMIN) {
        return true;
      }

      // 2. Get Global Permissions (Now fresh from DB)
      const userPermissions = (user.permissions as Record<string, boolean>) || {};

      // 2. Security Check (Role System Removed - using ONLY global permissions)
      const mergedPermissions = { ...userPermissions };

      // Check if user has any of the required permissions
      return requiredPermissions.some((permission) => {
        if (mergedPermissions[permission]) return true;
        if (mergedPermissions['all']) return true;
        return false;
      });
    } catch (error) {
      console.error('[PermissionsGuard] Global Catch Error:', error);
      return false; // Fail secure
    }
  }
}
