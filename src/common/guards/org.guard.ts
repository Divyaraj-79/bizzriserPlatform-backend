import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Ensures that the user belongs to the organization they are trying to access.
 * Automatically bypasses for Super Admins.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Super Admin bypass
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Check if the requested organization ID matches the user's organization ID
    // Supports checks via params (e.g., /:orgId/...) or body/query if needed
    const orgId = request.params.orgId || request.body.orgId || request.query.orgId;

    if (!orgId) {
      // If no orgId is explicitly provided in the request, we assume the user's orgId
      // should be used, or it's a generic endpoint. In a strict multi-tenant system,
      // many actions implicitly use req.user.orgId.
      return true;
    }

    if (user.orgId !== orgId) {
      throw new ForbiddenException('You do not have access to this organization.');
    }

    return true;
  }
}
