import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class WhatsAppAccountGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user || !user.role) {
        return true;
      }

      // 1. Fetch all allowed account IDs for this user if they are an Agent
      if (user.role === UserRole.AGENT) {
        try {
          const allowedAccess = await this.prisma.whatsAppAccountAccess.findMany({
            where: { userId: user.userId || user.sub },
            select: { whatsappAccountId: true },
          });
          user.allowedAccountIds = allowedAccess.map(a => a.whatsappAccountId);
          // Also attach to request for easier access in controllers
          request.allowedAccountIds = user.allowedAccountIds;
        } catch (err) {
          console.error('[WhatsAppAccountGuard] Failed to fetch allowed accounts:', err);
          user.allowedAccountIds = [];
        }
      }

      // 2. Extract Account ID from various possible locations
      const accountId = 
        request.params.accountId || 
        request.params.id || 
        request.query.accountId || 
        request.body.accountId || 
        request.body.whatsappAccountId;

      if (!accountId) {
        return true;
      }

      // 3. Check if the Agent has explicit access to this specific account
      if (user.role === UserRole.AGENT) {
        const allowed = Array.isArray(user.allowedAccountIds) && user.allowedAccountIds.includes(accountId);
        if (!allowed) {
          throw new ForbiddenException('Access denied: You are not assigned to this WhatsApp Account.');
        }
      }

      return true;
    } catch (error) {
       console.error('[WhatsAppAccountGuard] Global Catch Error:', error);
       // We should NOT throw 500 here if it's just a lookup failure for public-ish endpoints
       // But if it's a real ForbiddenException, rethrow it.
       if (error instanceof ForbiddenException) throw error;
       return true; 
    }
  }
}
