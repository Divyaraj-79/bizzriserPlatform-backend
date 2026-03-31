import { ConfigService } from '@nestjs/config';
export declare class SecurityService {
    private readonly configService;
    private readonly algorithm;
    private readonly key;
    constructor(configService: ConfigService);
    encrypt(text: string): string;
    decrypt(encryptedText: string): string;
    generateRandomToken(bytes?: number): string;
}
