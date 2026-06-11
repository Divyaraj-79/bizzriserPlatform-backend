import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLoggerService } from '../activity-logs/activity-logger.service';
export declare class AuthService {
    private readonly usersService;
    private readonly jwtService;
    private readonly configService;
    private readonly prisma;
    private readonly activityLogger;
    private readonly logger;
    constructor(usersService: UsersService, jwtService: JwtService, configService: ConfigService, prisma: PrismaService, activityLogger: ActivityLoggerService);
    validateUser(email: string, pass: string): Promise<any>;
    login(user: any, ip?: string): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    switchTenant(user: any, targetOrgId: string): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    refreshToken(refreshToken: string): Promise<{
        access_token: string;
    }>;
    getAccountPermissions(userId: string, accountId: string): Promise<string[]>;
}
