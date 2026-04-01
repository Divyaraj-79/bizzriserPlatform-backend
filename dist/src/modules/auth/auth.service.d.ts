import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
export declare class AuthService {
    private readonly usersService;
    private readonly jwtService;
    constructor(usersService: UsersService, jwtService: JwtService);
    validateUser(email: string, pass: string): Promise<any>;
    login(user: any, ip?: string): Promise<{
        access_token: string;
    }>;
    switchTenant(user: any, targetOrgId: string): Promise<{
        access_token: string;
    }>;
}
