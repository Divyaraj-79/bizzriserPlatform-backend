import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus, UseGuards, Req, Param, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('verify-signup-email')
  @HttpCode(HttpStatus.OK)
  async verifySignupEmail(@Body('email') email: string) {
    return this.authService.verifySignupEmail(email);
  }

  @Post('complete-signup')
  @HttpCode(HttpStatus.OK)
  async completeSignup(@Body() data: { email: string; passwordHash: string; orgName: string; planId: string; offerCode?: string }) {
    return this.authService.completeSignup(data);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Req() req: any, @Body() loginDto: any) {
    try {
      const user = await this.authService.validateUser(loginDto.email, loginDto.password);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      console.log(`[Auth] Attempting login for ${loginDto.email} from IP: ${ip}`);
      return await this.authService.login(user, ip);
    } catch (error) {
      console.error('[Auth Error]', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-tenant/:orgId')
  @HttpCode(HttpStatus.OK)
  async switchTenant(@Req() req: any, @Param('orgId') orgId: string) {
    if (req.user.role !== UserRole.SUPER_ADMIN && !req.user.isImpersonating) {
      throw new UnauthorizedException('Only Super Admins can switch tenants');
    }
    if (req.user.isImpersonating && orgId !== req.user.originalOrgId) {
      throw new UnauthorizedException('You can only switch back to your original organization');
    }
    return this.authService.switchTenant(req.user, orgId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    return this.authService.logout(req.user.sub, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('revoke-sessions')
  @HttpCode(HttpStatus.OK)
  async revokeSessions(@Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    return this.authService.revokeSessions(req.user.sub, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Get('permissions/:accountId')
  async getPermissions(@Req() req: any, @Param('accountId') accountId: string) {
    const permissions = await this.authService.getAccountPermissions(req.user.sub, accountId);
    return { permissions };
  }

  // --- 2FA Endpoints ---
  
  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  async setup2FA(@Req() req: any) {
    return this.authService.setup2FA(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verify2FASetup(@Req() req: any, @Body('token') token: string) {
    if (!token) throw new UnauthorizedException('Token is required');
    return this.authService.verify2FASetup(req.user.sub, token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disable2FA(@Req() req: any, @Body('currentPassword') currentPassword: string) {
    if (!currentPassword) throw new UnauthorizedException('Current password is required');
    return this.authService.disable2FA(req.user.sub, currentPassword);
  }

  @Post('2fa/login')
  @HttpCode(HttpStatus.OK)
  async complete2FALogin(@Req() req: any, @Body('pre_auth_token') preAuthToken: string, @Body('token') token: string) {
    if (!preAuthToken || !token) throw new UnauthorizedException('pre_auth_token and token are required');
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    return this.authService.complete2FALogin(preAuthToken, token, ip);
  }

  // --- End 2FA Endpoints ---

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Req() req: any, @Body('email') email: string) {
    if (!email) {
      throw new UnauthorizedException('Email is required');
    }
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'UNKNOWN';
    return this.authService.forgotPassword(email, ip);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: any) {
    const { email, otp } = body;
    if (!email || !otp) {
      throw new UnauthorizedException('Email and OTP are required');
    }
    return this.authService.verifyOtp(email, otp);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: any) {
    const { email, otp, newPassword, confirmPassword } = body;
    if (!email || !otp || !newPassword || !confirmPassword) {
      throw new UnauthorizedException('All fields are required');
    }
    if (newPassword !== confirmPassword) {
      throw new UnauthorizedException('Passwords do not match');
    }
    return this.authService.resetPassword(email, otp, newPassword);
  }
}
