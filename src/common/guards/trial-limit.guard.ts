import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { SubscriptionStatus, UserRole } from '@prisma/client';

export const CheckLimit = (limitField: string) => (target: any, key: string, descriptor: PropertyDescriptor) => {
  Reflector.createDecorator<string>()(limitField)(target, key, descriptor);
};

@Injectable()
export class TrialLimitGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.role === UserRole.SUPER_ADMIN) return true;

    // Get the limit field we need to check (e.g. 'whatsappAccountLimit', 'chatbotLimit')
    // We would need a custom decorator for this, but for simplicity we assume the controller defines it.
    // For now, this is a placeholder where you would use reflector to get the limit.
    
    return true; // Implemented inside specific feature guards or services for precise counting
  }
}
