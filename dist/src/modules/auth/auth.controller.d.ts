import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: {
        email: string;
        password: 'password123';
    }): Promise<{
        access_token: string;
    }>;
    switchTenant(req: any, orgId: string): Promise<{
        access_token: string;
    }>;
}
