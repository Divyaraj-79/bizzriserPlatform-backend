import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLoggerService } from '../activity-logs/activity-logger.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly activityLogger: ActivityLoggerService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any, ip?: string) {
    // Audit Trail: Update last IP (Non-blocking for login)
    if (ip && user.id) {
      try {
        await this.usersService.update(user.id, { 
          lastIp: ip,
          lastLoginAt: new Date()
        });
        await this.activityLogger.log(user.id, 'user_login', { ip, timestamp: new Date() }, ip);
      } catch (err) {
        console.error('[Auth Service] Failed to update login audit:', err);
      }
    }

    const accessTokenPayload = { 
      email: user.email, 
      sub: user.id, 
      orgId: user.organizationId, 
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      originalOrgId: user.organizationId,
      permissions: user.permissions || {}
    };

    const refreshTokenPayload = { sub: user.id };

    return {
      access_token: this.jwtService.sign(accessTokenPayload),
      refresh_token: this.jwtService.sign(refreshTokenPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
      }),
    };
  }

  async switchTenant(user: any, targetOrgId: string) {
    const accessTokenPayload = { 
      email: user.email, 
      sub: user.sub, 
      orgId: targetOrgId, 
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      originalOrgId: user.originalOrgId || user.orgId,
      isImpersonating: true
    };

    const refreshTokenPayload = { sub: user.userId || user.sub };

    return {
      access_token: this.jwtService.sign(accessTokenPayload),
      refresh_token: this.jwtService.sign(refreshTokenPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
      }),
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');

      const accessTokenPayload = { 
        email: user.email, 
        sub: user.id, 
        orgId: user.organizationId, 
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        originalOrgId: user.organizationId
      };

      return {
        access_token: this.jwtService.sign(accessTokenPayload),
      };
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getAccountPermissions(userId: string, accountId: string): Promise<string[]> {
    const user = await this.usersService.findOne(userId);
    if (!user) return [];

    // Admins always have all permissions
    if (user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN') {
      return ['all'];
    }

    // Since custom roles are removed we just return their global permissions strings
    const permissions = user.permissions as Record<string, boolean> || {};
    return Object.keys(permissions);
  }
}
