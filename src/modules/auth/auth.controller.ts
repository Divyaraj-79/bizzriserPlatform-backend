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
  @Get('permissions/:accountId')
  async getPermissions(@Req() req: any, @Param('accountId') accountId: string) {
    const permissions = await this.authService.getAccountPermissions(req.user.sub, accountId);
    return { permissions };
  }

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
