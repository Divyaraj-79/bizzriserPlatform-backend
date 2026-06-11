import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(req: any, loginDto: any): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    switchTenant(req: any, orgId: string): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    refresh(refreshToken: string): Promise<{
        access_token: string;
    }>;
    getPermissions(req: any, accountId: string): Promise<{
        permissions: string[];
    }>;
}
