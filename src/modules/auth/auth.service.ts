import { Injectable, UnauthorizedException, BadRequestException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateOrgCode } from '../../common/utils/org-code.util';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLoggerService } from '../activity-logs/activity-logger.service';
import { MailService } from './mail.service';
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
    private readonly mailService: MailService,
  ) { }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Your account is inactive or suspended.');
      }
      
      if (user.role !== 'SUPER_ADMIN' && user.organization?.status !== 'ACTIVE') {
        throw new UnauthorizedException('Your organization account is inactive or suspended.');
      }
      
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
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
      }
    };
  }

  async switchTenant(user: any, targetOrgId: string) {
    const isReturning = targetOrgId === user.originalOrgId;
    let targetEmail = user.email;
    let targetSub = user.sub;
    let targetRole = user.role;
    let targetFirstName = user.firstName;
    let targetLastName = user.lastName;

    if (!isReturning) {
      const orgAdmin = await this.prisma.user.findFirst({
        where: { organizationId: targetOrgId, role: 'ORG_ADMIN' }
      });
      if (orgAdmin) {
        targetEmail = orgAdmin.email;
        targetSub = orgAdmin.id;
        targetRole = orgAdmin.role;
        targetFirstName = orgAdmin.firstName;
        targetLastName = orgAdmin.lastName;
      }
    } else {
      const originalUser = await this.prisma.user.findUnique({
        where: { id: user.originalUserId || user.sub }
      });
      if (originalUser) {
        targetEmail = originalUser.email;
        targetSub = originalUser.id;
        targetRole = originalUser.role;
        targetFirstName = originalUser.firstName;
        targetLastName = originalUser.lastName;
      }
    }

    const accessTokenPayload = {
      email: targetEmail,
      sub: targetSub,
      orgId: targetOrgId,
      role: targetRole,
      firstName: targetFirstName,
      lastName: targetLastName,
      originalUserId: user.originalUserId || user.sub,
      originalOrgId: user.originalOrgId || user.orgId,
      isImpersonating: !isReturning
    };

    const refreshTokenPayload = { sub: targetSub };

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

      const refreshTokenPayload = { sub: user.id };

      return {
        access_token: this.jwtService.sign(accessTokenPayload),
        refresh_token: this.jwtService.sign(refreshTokenPayload, {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
        }),
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

  async forgotPassword(email: string, ip: string = 'UNKNOWN') {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Please enter a valid email or Contact support.');
    }

    // --- Rate Limiting Logic ---
    const identifiers = [email, ip];
    for (const identifier of identifiers) {
      if (identifier === 'UNKNOWN') continue;

      let rateLimit = await this.prisma.otpRateLimit.findUnique({ where: { identifier } });
      
      // If resetAt is in the past, reset the count
      if (rateLimit && rateLimit.resetAt && rateLimit.resetAt < new Date()) {
        rateLimit = await this.prisma.otpRateLimit.update({
          where: { identifier },
          data: { count: 0, resetAt: null }
        });
      }

      if (rateLimit && rateLimit.count >= 5) {
        throw new HttpException({
          message: 'Too many OTP requests. Please try again later.',
          resetAt: rateLimit.resetAt
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // Increment count for both email and IP
    for (const identifier of identifiers) {
      if (identifier === 'UNKNOWN') continue;
      
      const rateLimit = await this.prisma.otpRateLimit.upsert({
        where: { identifier },
        update: { count: { increment: 1 } },
        create: { identifier, count: 1 }
      });

      // If they just hit the 5 limit, set the reset timer to 24 hours from now
      if (rateLimit.count >= 5 && !rateLimit.resetAt) {
        const resetTime = new Date();
        resetTime.setHours(resetTime.getHours() + 24);
        await this.prisma.otpRateLimit.update({
          where: { identifier },
          data: { resetAt: resetTime }
        });
      }
    }
    // --- End Rate Limiting Logic ---

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 10); // Changed to 10 minutes

    // Save OTP to user (plaintext is fine for short lived random code, or we could hash it. 
    // For simplicity and matching standard practices where quick comparison is needed, 
    // hashing is better but plaintext works for demo. Let's hash it for security.)
    const hashedOtp = await bcrypt.hash(otp, 10);
    
    await this.usersService.update(user.id, {
      resetOtp: hashedOtp,
      resetOtpExpiry: expiry
    });

    await this.mailService.sendPasswordResetOtp(email, otp, user.firstName || 'User');
    return { message: 'Verification code sent to your email.' };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (!user.resetOtp || !user.resetOtpExpiry) {
      throw new UnauthorizedException('No password reset requested');
    }

    if (new Date() > new Date(user.resetOtpExpiry)) {
      throw new UnauthorizedException('OTP has expired');
    }

    const isMatch = await bcrypt.compare(otp, user.resetOtp);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid OTP');
    }

    return { message: 'OTP is valid' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (!user.resetOtp || !user.resetOtpExpiry) {
      throw new UnauthorizedException('No password reset requested');
    }

    if (new Date() > new Date(user.resetOtpExpiry)) {
      throw new UnauthorizedException('OTP has expired');
    }

    const isMatch = await bcrypt.compare(otp, user.resetOtp);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await this.usersService.update(user.id, {
      passwordHash: newPasswordHash,
      resetOtp: null,
      resetOtpExpiry: null
    });

    return { message: 'Password has been reset successfully' };
  }

  async verifySignupEmail(email: string) {
    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException('Account has already register, Please sign in.');
    }
    const invitation = await this.prisma.clientInvitation.findUnique({
      where: { email }
    });
    if (!invitation) {
      throw new BadRequestException('No invitation found for this email.');
    }
    if (invitation.status === 'ACTIVE') {
      throw new BadRequestException('Account has already register, Please sign in.');
    }
    
    // Register the user temporarily (but don't create User/Organization records yet)
    await this.prisma.clientInvitation.update({
      where: { email },
      data: { status: 'REGISTERED' }
    });

    return { message: 'Email verified successfully.', firstName: invitation.firstName, lastName: invitation.lastName };
  }

  async completeSignup(data: { email: string; passwordHash: string; orgName: string; planId: string; offerCode?: string }) {
    const invitation = await this.prisma.clientInvitation.findUnique({
      where: { email: data.email }
    });

    if (!invitation || invitation.status === 'ACTIVE') {
      throw new BadRequestException('Invalid or expired invitation.');
    }

    const orgCode = generateOrgCode(data.orgName);
    const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
    
    // Set 3 days trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 3);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          name: data.orgName,
          slug,
          orgCode,
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
          packageId: data.planId,
          status: 'ACTIVE',
          credits: 50
        }
      });

      // 2. Create User
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          role: 'ORG_ADMIN',
          organizationId: org.id
        }
      });

      // 3. Mark Invitation ACTIVE
      await tx.clientInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACTIVE',
          organizationId: org.id,
          tempPasswordHash: null // clear if any
        }
      });

      return { org, user };
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_PUBLIC_URL') || 'http://localhost:3000';
    const loginUrl = `${frontendUrl}/login`;
    await this.mailService.sendOnboardingCompleteEmail(data.email, invitation.firstName, orgCode, loginUrl);

    // Return tokens so they are immediately logged in
    return this.login(result.user);
  }
}
