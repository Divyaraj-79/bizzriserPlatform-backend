import { Injectable, UnauthorizedException, BadRequestException, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateOrgCode } from '../../common/utils/org-code.util';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLoggerService } from '../activity-logs/activity-logger.service';
import { MailService } from './mail.service';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

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

  async login(user: any, ip?: string, userAgent?: string) {
    // Fetch fresh user data to get twoFactorEnabled status
    const freshUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, twoFactorEnabled: true, twoFactorSecret: true }
    });

    // If 2FA is enabled, issue a short-lived pre-auth token instead of a full JWT
    if (freshUser?.twoFactorEnabled) {
      const preAuthToken = this.jwtService.sign(
        { sub: user.id, purpose: '2fa_challenge' },
        { expiresIn: '5m' }
      );
      return {
        requires_2fa: true,
        pre_auth_token: preAuthToken,
      };
    }

    // Audit Trail: Update last IP (Non-blocking for login)
    if (ip && user.id) {
      try {
        await this.usersService.update(user.id, {
          lastIp: ip,
          lastLoginAt: new Date()
        });
        await this.activityLogger.log(user.id, 'user_login', { ip, timestamp: new Date() }, ip, userAgent);
      } catch (err) {
        console.error('[Auth Service] Failed to update login audit:', err);
      }
    }

    // Ensure Superadmins always have unlimited control without plan boundaries
    if (user.role === 'SUPER_ADMIN' && user.organizationId) {
      try {
        await this.prisma.organization.update({
          where: { id: user.organizationId },
          data: { credits: -1, subscriptionStatus: 'ACTIVE', status: 'ACTIVE' }
        });
      } catch (err) {
        console.error('[Auth Service] Failed to enforce Superadmin org limits:', err);
      }
    }

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        ip,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });

    const accessTokenPayload = {
      email: user.email,
      sub: user.id,
      sessionId: session.id,
      orgId: user.organizationId,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      originalOrgId: user.organizationId,
      permissions: user.permissions || {}
    };

    const refreshTokenPayload = { sub: user.id, sessionId: session.id };

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

  async complete2FALogin(preAuthToken: string, totpToken: string, ip?: string, userAgent?: string) {
    // Verify the pre-auth token
    let payload: any;
    try {
      payload = this.jwtService.verify(preAuthToken);
    } catch (err) {
      throw new UnauthorizedException('2FA session expired. Please log in again.');
    }

    if (payload.purpose !== '2fa_challenge') {
      throw new UnauthorizedException('Invalid 2FA token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('2FA is not enabled for this account');
    }

    // Verify the TOTP token with a 1-step window for clock skew tolerance
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpToken,
      window: 1,
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid or expired 2FA code');
    }

    // Audit trail
    if (ip) {
      try {
        await this.usersService.update(user.id, { lastIp: ip, lastLoginAt: new Date() });
        await this.activityLogger.log(user.id, 'user_login_2fa', { ip, timestamp: new Date() }, ip, userAgent);
      } catch (err) {
        console.error('[Auth Service] Failed to update 2FA login audit:', err);
      }
    }

    // Enforce Superadmin limits
    if (user.role === 'SUPER_ADMIN' && user.organizationId) {
      try {
        await this.prisma.organization.update({
          where: { id: user.organizationId },
          data: { credits: -1, subscriptionStatus: 'ACTIVE', status: 'ACTIVE' }
        });
      } catch (err) {}
    }

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        ip,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });

    const accessTokenPayload = {
      email: user.email,
      sub: user.id,
      sessionId: session.id,
      orgId: user.organizationId,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      originalOrgId: user.organizationId,
      permissions: (user as any).permissions || {}
    };

    return {
      access_token: this.jwtService.sign(accessTokenPayload),
      refresh_token: this.jwtService.sign({ sub: user.id, sessionId: session.id }, {
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
      sessionId: user.sessionId,
      isImpersonating: !isReturning
    };

    const refreshTokenPayload = { sub: targetSub, sessionId: user.sessionId };

    return {
      access_token: this.jwtService.sign(accessTokenPayload),
      refresh_token: this.jwtService.sign(refreshTokenPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
      }),
    };
  }

  async logout(userId: string, sessionId?: string, ip?: string) {
    if (sessionId) {
      await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    await this.activityLogger.log(userId, 'user_logout', { timestamp: new Date(), ip }, ip);
    return { success: true };
  }

  async revokeSessions(userId: string, currentSessionId?: string, currentIp?: string) {
    if (currentSessionId) {
      await this.prisma.session.deleteMany({
        where: { userId, id: { not: currentSessionId } }
      });
    } else {
      await this.prisma.session.deleteMany({ where: { userId } });
    }
    await this.activityLogger.log(userId, 'revoke_sessions', { timestamp: new Date(), ip: currentIp }, currentIp);
    return { success: true, message: 'All other sessions have been revoked.' };
  }

  async revokeSession(userId: string, targetSessionId: string, currentIp?: string) {
    await this.prisma.session.deleteMany({
      where: { id: targetSessionId, userId } // Ensure it belongs to the user
    });
    await this.activityLogger.log(userId, 'revoke_specific_session', { timestamp: new Date(), targetSessionId, ip: currentIp }, currentIp);
    return { success: true, message: 'Session revoked successfully.' };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      if (payload.sessionId) {
        const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });
        if (!session) throw new UnauthorizedException('Session revoked');
        await this.prisma.session.update({
          where: { id: payload.sessionId },
          data: { lastActive: new Date() }
        });
      }

      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');

      const accessTokenPayload = {
        email: user.email,
        sub: user.id,
        sessionId: payload.sessionId,
        orgId: user.organizationId,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        originalOrgId: user.organizationId
      };

      const refreshTokenPayload = { sub: user.id, sessionId: payload.sessionId };

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

  /**
   * PHASE 1 of two-phase onboarding:
   * Validates the invitation, stores staging data (orgName, passwordHash, planId),
   * marks invitation as PENDING_PAYMENT, and returns a staging JWT.
   * No Organization or User is created here.
   */
  async initiateSignup(data: { email: string; passwordHash: string; orgName: string; planId: string; billingCycle: string }) {
    const invitation = await this.prisma.clientInvitation.findUnique({
      where: { email: data.email }
    });

    if (!invitation) {
      throw new BadRequestException('No invitation found for this email.');
    }

    if (invitation.status === 'ACTIVE') {
      throw new BadRequestException('An account already exists for this email. Please sign in.');
    }

    // If already PENDING_PAYMENT, check if the pending subscription still exists/not activated
    // to allow retries after a failed payment
    if (invitation.status === 'PENDING_PAYMENT') {
      const existingActiveSub = await this.prisma.razorpaySubscription.findFirst({
        where: {
          invitationEmail: data.email,
          status: { in: ['ACTIVE'] },
        },
      });
      if (existingActiveSub) {
        throw new BadRequestException('An active subscription already exists for this email. Please sign in.');
      }
    }

    // Store staging data on the invitation record
    await this.prisma.clientInvitation.update({
      where: { email: data.email },
      data: {
        status: 'PENDING_PAYMENT',
        stagingOrgName: data.orgName,
        stagingPasswordHash: data.passwordHash,
        stagingPlanId: data.planId,
        stagingBillingCycle: data.billingCycle,
        pendingRazorpaySubId: null, // will be filled by create-subscription
      },
    });

    // Return a short-lived staging JWT (no orgId, no user yet)
    const stagingPayload = {
      email: data.email,
      firstName: invitation.firstName,
      stage: 'PAYMENT_PENDING',
    };
    const stagingToken = this.jwtService.sign(stagingPayload, { expiresIn: '2h' });

    return { stagingToken, firstName: invitation.firstName };
  }

  /**
   * PHASE 2 of two-phase onboarding:
   * Called ONLY by the Razorpay webhook after payment is confirmed.
   * Creates the Organization, User, and links the subscription.
   * Idempotent: safe to call multiple times.
   */
  async finalizeSignup(email: string, razorpaySubscriptionId: string): Promise<void> {
    const invitation = await this.prisma.clientInvitation.findUnique({
      where: { email }
    });

    if (!invitation) {
      this.logger.error(`[finalizeSignup] No invitation found for email: ${email}`);
      return;
    }

    // Already finalized — idempotent guard
    if (invitation.status === 'ACTIVE' && invitation.organizationId) {
      this.logger.log(`[finalizeSignup] Already finalized for email: ${email}. Skipping.`);
      return;
    }

    if (!invitation.stagingOrgName || !invitation.stagingPasswordHash || !invitation.stagingPlanId) {
      this.logger.error(`[finalizeSignup] Missing staging data for email: ${email}`);
      return;
    }

    const orgName = invitation.stagingOrgName;
    const orgCode = generateOrgCode(orgName);
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Organization (NO trial — they just paid)
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          orgCode,
          subscriptionStatus: 'ACTIVE',
          packageId: invitation.stagingPlanId,
          status: 'ACTIVE',
          credits: 50, // Starter credits; full plan credits added by webhook
        }
      });

      // 2. Create User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: invitation.stagingPasswordHash!,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          role: 'ORG_ADMIN',
          organizationId: org.id,
        }
      });

      // 3. Link the RazorpaySubscription to the new org
      await tx.razorpaySubscription.updateMany({
        where: { razorpaySubscriptionId },
        data: { organizationId: org.id },
      });

      // 4. Mark Invitation ACTIVE and clear staging data
      await tx.clientInvitation.update({
        where: { email },
        data: {
          status: 'ACTIVE',
          organizationId: org.id,
          stagingOrgName: null,
          stagingPasswordHash: null,
          stagingPlanId: null,
          stagingBillingCycle: null,
          pendingRazorpaySubId: null,
        }
      });

      return { org, user };
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_PUBLIC_URL') || 'http://localhost:3000';
    const loginUrl = `${frontendUrl}/login`;
    this.mailService.sendOnboardingCompleteEmail(email, invitation.firstName, orgCode, loginUrl).catch(err => {
      this.logger.error(`[finalizeSignup] Failed to send welcome email: ${err.message}`);
    });

    this.logger.log(`[finalizeSignup] Successfully created Org(${result.org.id}) and User(${result.user.id}) for ${email}`);
  }

  // --- 2FA METHODS ---

  async setup2FA(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('User not found');

    const secret = speakeasy.generateSecret({ name: `BizzRiser (${user.email})` });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 }
    });

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url as string);

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl
    };
  }

  async verify2FASetup(userId: string, token: string) {
    const user = await this.usersService.findOne(userId);
    if (!user || !user.twoFactorSecret) throw new BadRequestException('2FA setup not initiated properly');

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (!verified) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true }
    });

    return { success: true };
  }

  async disable2FA(userId: string, currentPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Incorrect password');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null }
    });

    return { success: true };
  }
}
