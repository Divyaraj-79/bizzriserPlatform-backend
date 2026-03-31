import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class SecurityService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('encryption.key');
    if (!encryptionKey || encryptionKey.length !== 64) {
      throw new Error('Invalid ENCRYPTION_KEY length. Expected 64 hex characters (32 bytes).');
    }
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  /**
   * Encrypts plain text using AES-256-GCM.
   * Returns a colon-separated string: iv:authTag:encryptedContent
   */
  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag().toString('hex');
      
      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
      throw new InternalServerErrorException(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts a colon-separated string: iv:authTag:encryptedContent
   */
  decrypt(encryptedText: string): string {
    try {
      const [ivHex, authTagHex, encryptedContent] = encryptedText.split(':');
      
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new InternalServerErrorException(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generates a random secure token.
   */
  generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }
}
