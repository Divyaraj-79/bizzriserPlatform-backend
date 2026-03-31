import { Injectable, Logger, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/services/security.service';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiVersion: string;
  private readonly graphBaseUrl: string;
  private readonly http: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly securityService: SecurityService,
  ) {
    this.apiVersion = this.configService.get<string>('whatsapp.apiVersion') ?? 'v20.0';
    this.graphBaseUrl = this.configService.get<string>('whatsapp.graphBaseUrl') ?? 'https://graph.facebook.com';
    const appSecret = this.configService.get<string>('whatsapp.appSecret');
    const appId = this.configService.get<string>('whatsapp.appId');

    this.http = axios.create({
      baseURL: `${this.graphBaseUrl}/${this.apiVersion}`,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Connects a new WhatsApp Business Account using the code from Embedded Signup.
   */
  async connectAccount(orgId: string, data: { code?: string; accessToken?: string }) {
    const { code, accessToken: providedToken } = data;
    const appId = this.configService.get<string>('whatsapp.appId');
    const appSecret = this.configService.get<string>('whatsapp.appSecret');

    if (!appId || !appSecret || appSecret.includes('your_facebook_app_secret')) {
      throw new HttpException('Meta App ID or Secret is not configured in the backend environment.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let accessToken: string | undefined = providedToken;

    // 1. Exchange code for Token (only if code is provided)
    if (code) {
      this.logger.log(`Attempting token exchange with code: ${code.substring(0, 10)}...`);
      try {
        const tokenRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/oauth/access_token`, {
          params: {
            client_id: appId,
            client_secret: appSecret,
            code,
          },
        });
        accessToken = tokenRes.data.access_token;
        this.logger.log('Token exchange successful');
      } catch (tokenErr: any) {
        this.logger.error(`Token exchange failed: ${tokenErr.response?.data?.error?.message || tokenErr.message}`);
        throw new HttpException(`Meta Token Exchange Failed: ${tokenErr.response?.data?.error?.message || tokenErr.message}`, HttpStatus.BAD_REQUEST);
      }
    }

    if (!accessToken) {
      throw new HttpException('Missing authorization code or access token from Meta signup.', HttpStatus.BAD_REQUEST);
    }

    // 2. Discover WABA and Phone Number
    this.logger.log('Discovering WABA IDs...');
    let wabaId: string;
    try {
      const debugRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: `${appId}|${appSecret}`,
        },
      });
      wabaId = debugRes.data.data.granular_scopes?.find((s: any) => s.scope === 'whatsapp_business_management')?.target_ids?.[0];
      this.logger.log(`Found WABA ID: ${wabaId}`);
    } catch (debugErr: any) {
      this.logger.error(`WABA Discovery failed: ${debugErr.response?.data?.error?.message || debugErr.message}`);
      throw new HttpException('Failed to discover WhatsApp Business Account assets.', HttpStatus.BAD_REQUEST);
    }
    
    if (!wabaId) {
      throw new HttpException('Could not find a WhatsApp Business Account associated with this token. Please ensure you have completed the Meta signup flow.', HttpStatus.BAD_REQUEST);
    }

    // 3. Get Phone Numbers for this WABA
    const phoneRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/phone_numbers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const phoneData = phoneRes.data.data?.[0]; // Take the first one for simplicity
    if (!phoneData) {
      throw new HttpException('No phone numbers found in the connected WABA.', HttpStatus.BAD_REQUEST);
    }

    const { id: phoneNumberId, display_phone_number: phoneNumber, verified_name: displayName } = phoneData;

    // 4. Encrypt sensitive token
    const encryptedToken = this.securityService.encrypt(accessToken);

    // 5. Generate security tokens for webhooks
    const verifyToken = this.securityService.generateRandomToken(16);
    const webhookSecret = this.securityService.generateRandomToken(32);

    try {
      this.logger.log(`Linking WhatsApp Account: ${phoneNumber} (${phoneNumberId}) to Org: ${orgId}`);
      
      const account = await this.prisma.whatsAppAccount.upsert({
        where: { phoneNumberId },
        update: {
          organizationId: orgId,
          accessToken: encryptedToken,
          wabaId,
          displayName,
          phoneNumber,
          status: 'ACTIVE',
        },
        create: {
          organizationId: orgId,
          phoneNumberId,
          wabaId,
          displayName: displayName || phoneNumber,
          phoneNumber,
          accessToken: encryptedToken,
          verifyToken,
          webhookSecret,
        },
      });

      // 6. Register & Subscribe Webhooks
      try {
        // Subscribe the WABA to our App's webhooks
        await axios.post(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/subscribed_apps`, {}, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        this.logger.log(`WABA ${wabaId} subscribed to webhooks successfully.`);

        // Also register phone number for Cloud API use
        await axios.post(`${this.graphBaseUrl}/${this.apiVersion}/${phoneNumberId}/register`, {
          messaging_product: 'whatsapp',
          pin: '123456',
        }, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        await this.syncAccount(orgId, account.id);
      } catch (subErr: any) {
        this.logger.warn(`Webhook subscription or phone registration failed: ${subErr.response?.data?.error?.message || subErr.message}`);
      }

      return account;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('WhatsApp account with this phone number ID already exists.');
      }
      throw error;
    }
  }

  /**
   * Sends a simple text message via WhatsApp Cloud API.
   * NOTE: In a multi-tenant system, you'd usually pass the account's specific token.
   */
  async sendTextMessage(orgId: string, accountId: string, to: string, message: string) {
    // Fetch the account to get the token
    const adminAccount = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });

    if (!adminAccount) {
      throw new ConflictException('WhatsApp account not found or access denied');
    }

    const { token: validatedToken } = await this.getValidToken(adminAccount);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${adminAccount.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    };

    try {
      this.logger.log(`Sending WhatsApp message for org ${orgId} via account ${accountId} to ${to}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send message via account ${accountId}`);
    }
  }

  /**
   * Sends a template message via WhatsApp Cloud API.
   */
  async sendTemplateMessage(orgId: string, accountId: string, to: string, templateName: string, languageCode: string = 'en_US', components: any[] = []) {
    const adminAccount = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });

    if (!adminAccount) {
      throw new ConflictException('WhatsApp account not found or access denied');
    }

    const { token: validatedToken } = await this.getValidToken(adminAccount);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${adminAccount.phoneNumberId}/messages`;

    const payload: any = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components && components.length > 0) {
      payload.template.components = components;
    }

    try {
      this.logger.log(`Sending WhatsApp template (${templateName}) for org ${orgId} to ${to}`);
      this.logger.debug(`Template Payload: ${JSON.stringify(payload)}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send template message via account ${accountId}`);
    }
  }

  async listAccounts(orgId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        phoneNumberId: true,
        wabaId: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        businessProfile: true,
        createdAt: true,
      },
    });
  }

  /**
   * Fetches message templates for a WhatsApp Business Account from Meta.
   */
  async getTemplates(orgId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;

    try {
      this.logger.log(`Fetching WhatsApp templates for org ${orgId} via account ${accountId} (WABA: ${account.wabaId})`);
      const response = await axios.get(url, {
        params: { limit: 100 },
        headers: {
          Authorization: `Bearer ${validatedToken}`,
        },
      });
      
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to fetch templates via account ${accountId}`);
    }
  }

  /**
   * Synchronizes account details (quality, limits) from Meta.
   */
  async syncAccount(orgId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    try {
      const { token: validatedToken } = await this.getValidToken(account);

      const phoneRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/phone_numbers`, {
        params: { fields: 'display_phone_number,quality_rating,messaging_limit_tier,verified_name,code_verification_status,name_status' },
        headers: { Authorization: `Bearer ${validatedToken}` },
      });

      const phoneData = phoneRes.data?.data || [];
      const phoneInfo = phoneData.find((p: any) => p.id === account.phoneNumberId);
      
      if (!phoneInfo) {
        this.logger.error(`Phone number ${account.phoneNumberId} not found in WABA ${account.wabaId}. Available IDs: ${phoneData.map((p: any) => p.id).join(', ')}`);
        throw new Error('Phone number no longer associated with this WABA');
      }

      const updatedAccount = await this.prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: {
          displayName: phoneInfo.verified_name || account.displayName,
          status: phoneInfo.code_verification_status === 'VERIFIED' ? 'ACTIVE' : 'INACTIVE',
          businessProfile: {
            ...(typeof account.businessProfile === 'object' ? (account.businessProfile as any) : {}),
            qualityRating: (phoneInfo.quality_rating || 'UNKNOWN').toUpperCase(),
            messagingLimit: phoneInfo.messaging_limit_tier || 'UNKNOWN',
            nameStatus: phoneInfo.name_status || 'UNKNOWN',
            lastSyncAt: new Date().toISOString(),
          },
        },
      });

      return updatedAccount;
    } catch (error) {
      this.handleError(error, `Sync failed for account ${accountId}`);
    }
  }

  /**
   * Disconnects and removes a WhatsApp account from the organization.
   */
  async disconnectAccount(orgId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });

    if (!account) {
      throw new ConflictException('WhatsApp account not found or access denied');
    }

    // Optional: Unsubscribe from Meta webhooks if needed
    // However, for total disconnection, we usually just delete the record.
    
    return this.prisma.whatsAppAccount.delete({
      where: { id: accountId },
    });
  }

  /**
   * Robustly gets a valid access token for an account.
   * If the stored token fails (401), it tries the global fallback and updates DB.
   */
  private async getValidToken(account: any): Promise<{ token: string; wasUpdated: boolean }> {
    const storedToken = this.securityService.decrypt(account.accessToken);
    const globalToken = this.configService.get<string>('whatsapp.accessToken');

    try {
      // 1. Test the stored token with a simple debug request
      await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
        params: { input_token: storedToken },
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      return { token: storedToken, wasUpdated: false };
    } catch (error: any) {
      // 2. If 401 and global token is different, try global
      if (error.response?.status === 401 && globalToken && globalToken !== storedToken) {
        this.logger.warn(`Stored token for account ${account.id} failed (401). Trying global token...`);
        try {
          await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
            params: { input_token: globalToken },
            headers: { Authorization: `Bearer ${globalToken}` },
          });
          
          this.logger.log(`Global token validated! Updating database for account ${account.id}...`);
          await this.prisma.whatsAppAccount.update({
            where: { id: account.id },
            data: { accessToken: this.securityService.encrypt(globalToken) },
          });
          
          return { token: globalToken, wasUpdated: true };
        } catch (globalErr) {
          this.logger.error(`Global token also failed verification.`);
          throw error; // throw original 401
        }
      }
      throw error;
    }
  }

  private handleError(error: any, contextMessage: string): never {
    const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    const errorData = error.response?.data?.error || error.response?.data || { message: 'Unknown WhatsApp API error' };
    
    // Extract Meta's specific message to surface it to the UI
    const metaMessage = errorData.message || 'WhatsApp API Error';
    const enhancedMessage = `${contextMessage}: ${metaMessage}`;

    this.logger.error(`${contextMessage}:`, JSON.stringify(errorData));
    
    throw new HttpException(
      {
        success: false,
        message: enhancedMessage,
        details: errorData,
      },
      status,
    );
  }
}
