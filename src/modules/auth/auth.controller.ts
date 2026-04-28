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
  constructor(private readonly authService: AuthService) {}

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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Post('switch-tenant/:orgId')
  @HttpCode(HttpStatus.OK)
  async switchTenant(@Req() req: any, @Param('orgId') orgId: string) {
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
}
