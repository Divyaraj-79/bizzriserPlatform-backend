import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus, UserRole } from '@prisma/client';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;
    
    // Super Admins bypass subscription checks
    if (user.role === UserRole.SUPER_ADMIN) return true;

    const org = await this.prisma.organization.findUnique({
      where: { id: user.orgId || user.organizationId },
      select: { subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true }
    });

    if (!org) throw new ForbiddenException('Organization not found');

    const now = new Date();

    if (org.subscriptionStatus === SubscriptionStatus.TRIAL) {
      if (org.trialEndsAt && now > org.trialEndsAt) {
        throw new ForbiddenException('Your trial has expired. Please upgrade to a paid plan to continue using these services.');
      }
      return true;
    }

    if (
      org.subscriptionStatus === SubscriptionStatus.PAST_DUE ||
      org.subscriptionStatus === SubscriptionStatus.EXPIRED ||
      org.subscriptionStatus === SubscriptionStatus.CANCELLED
    ) {
      if (org.subscriptionEndsAt && now > org.subscriptionEndsAt) {
        throw new ForbiddenException('Your subscription is inactive. Please renew your plan to continue using these services.');
      }
    }

    return true;
  }
}
