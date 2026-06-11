import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class OrganizationGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
