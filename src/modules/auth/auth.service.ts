import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { 
      email: user.email, 
      sub: user.id, 
      orgId: user.organizationId, 
      role: user.role,
      originalOrgId: user.organizationId
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async switchTenant(user: any, targetOrgId: string) {
    const payload = { 
      email: user.email, 
      sub: user.sub, 
      orgId: targetOrgId, 
      role: user.role,
      originalOrgId: user.originalOrgId || user.orgId,
      isImpersonating: true
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
