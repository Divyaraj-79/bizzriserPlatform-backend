import { PrismaService } from '../../prisma/prisma.service';
import { User, Prisma, UserRole } from '@prisma/client';
import { ActivityLoggerService } from '../activity-logs/activity-logger.service';
export declare class UsersService {
    private readonly prisma;
    private readonly activityLogger;
    constructor(prisma: PrismaService, activityLogger: ActivityLoggerService);
    findOne(id: string): Promise<any | null>;
    findByEmail(email: string): Promise<any | null>;
    update(id: string, data: Prisma.UserUpdateInput): Promise<User>;
    findAllByOrganization(organizationId: string): Promise<any[]>;
    create(data: any): Promise<User>;
    updateUser(id: string, organizationId: string, data: {
        accountAssignments?: any[];
        status?: string;
        firstName?: string;
        lastName?: string;
        permissions?: any;
        timezone?: string;
    }): Promise<any>;
    remove(id: string, organizationId: string): Promise<User>;
    updateRole(id: string, organizationId: string, role: UserRole): Promise<User>;
    getAccountAccess(userId: string, whatsappAccountId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        whatsappAccountId: string;
    } | null>;
}
