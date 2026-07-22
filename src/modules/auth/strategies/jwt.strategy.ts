import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: any) {
    if (payload.sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId }
      });
      if (!session) {
        throw new UnauthorizedException('Session has been revoked');
      }
    }

    return {
      sub: payload.sub,       // Used by RolesGuard, AnalyticsController, etc.
      userId: payload.sub,    // Backwards compatibility alias
      email: payload.email,
      orgId: payload.orgId,
      sessionId: payload.sessionId,
      role: payload.role,
      originalOrgId: payload.originalOrgId,
      originalUserId: payload.originalUserId,
      isImpersonating: payload.isImpersonating,
      firstName: payload.firstName,
      lastName: payload.lastName,
      permissions: payload.permissions,
    };
  }
}
