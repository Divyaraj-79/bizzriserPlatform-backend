import { Injectable, Logger, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/services/security.service';
import { WebhookEventType } from '@prisma/client';
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
    this.apiVersion = this.configService.get<string>('whatsapp.apiVersion') ?? 'v22.0';
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
  async connectAccount(orgId: string, data: { code?: string; accessToken?: string; wabaId?: string; phoneNumberId?: string }) {
    const { code, accessToken: providedToken, wabaId: providedWabaId, phoneNumberId: providedPhoneId } = data;
    const appId = this.configService.get<string>('whatsapp.appId');
    const appSecret = this.configService.get<string>('whatsapp.appSecret');
    const systemAccessToken = this.configService.get<string>('whatsapp.accessToken');

    if (!appId || !appSecret || !systemAccessToken) {
      throw new HttpException('Meta App ID, Secret, or System Access Token is not configured.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let accessToken: string | undefined = providedToken;

    // 1. Exchange code for Token (v4 Flow with Automatic Fallback)
    if (code && !accessToken) {
      this.logger.log(`STEP 1: Exchanging code for token...`);
      try {
        // Path A: Modern Clean Exchange (v4 Standard)
        const tokenRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/oauth/access_token`, {
          params: { client_id: appId, client_secret: appSecret, code },
        });
        accessToken = tokenRes.data.access_token;
        this.logger.log('SUCCESS: Clean Token exchange achieved.');
      } catch (tokenErr: any) {
        // Path B: Fallback with Redirect URI (Required for some legacy/custom configs)
        this.logger.warn(`NOTICE: Clean exchange failed. Retrying with production redirect_uri fallback...`);
        const prodRedirectUri = 'https://bizzriser-platform-frontend-yw8n-sand.vercel.app/whatsapp-account';
        try {
          const tokenRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/oauth/access_token`, {
            params: { client_id: appId, client_secret: appSecret, code, redirect_uri: prodRedirectUri },
          });
          accessToken = tokenRes.data.access_token;
          this.logger.log('SUCCESS: Fallback Token exchange achieved.');
        } catch (fallbackErr: any) {
          this.logger.error(`CRITICAL: All exchange paths failed. Meta response: ${fallbackErr.response?.data?.error?.message || fallbackErr.message}`);
        }
      }
    }

    let wabaId = providedWabaId;
    let phoneNumberId = providedPhoneId;

    // 2. Discover WABA ID via Debug Token (if not provided)
    if (!wabaId && accessToken) {
      try {
        const debugRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
          params: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
        });
        const debugData = debugRes.data.data;
        wabaId = debugData.granular_scopes?.find((s: any) => s.scope === 'whatsapp_business_management')?.target_ids?.[0] ||
                 debugData.granular_scopes?.find((s: any) => s.scope === 'whatsapp_business_messaging')?.target_ids?.[0] ||
                 debugData.target_ids?.[0] || debugData.profile_id;
        if (wabaId) this.logger.log(`Discovered WABA ID via debug_token: ${wabaId}`);
      } catch (debugErr: any) {
        this.logger.warn(`Debug token discovery skipped: ${debugErr.message}`);
      }
    }

    // 3. Final Discovery Fallback: Safe Webhook Lookup (No-Migration needed)
    if (!wabaId) {
       this.logger.log(`Performing Safe Webhook discovery for App ${appId} (Retrying for 5s)...`);
       for (let i = 0; i < 5; i++) {
         if (i > 0) await new Promise(resolve => setTimeout(resolve, 1000));
         try {
           const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
           const recentEvents = await this.prisma.webhookEvent.findMany({
             where: {
               // We use the safe, existing type to avoid DB errors
               eventType: WebhookEventType.MESSAGE_RECEIVED,
               createdAt: { gte: fiveMinutesAgo }
             },
             orderBy: { createdAt: 'desc' }
           });

           for (const event of recentEvents) {
             const payload = event.payload as any;
             if (payload.isSignupEvent && payload.waba_info?.partner_app_id === String(appId)) {
               wabaId = payload.waba_info?.waba_id;
               this.logger.log(`SUCCESS: Intercepted WABA ID via safe webhook on attempt ${i + 1}: ${wabaId}`);
               break;
             }
           }
           if (wabaId) break;
         } catch (err: any) {
           this.logger.warn(`Safe Discovery attempt ${i + 1} failed: ${err.message}`);
         }
       }
    }

    if (!wabaId) {
       this.logger.log(`Wait... scanning client WABAs manually as absolute final fallback...`);
       try {
         const clientWabasRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${appId}/client_whatsapp_business_accounts`, {
           headers: { Authorization: `Bearer ${systemAccessToken}` }
         });
         const clientWabas = clientWabasRes.data.data;
         if (clientWabas && clientWabas.length > 0) {
            wabaId = clientWabas[0].id;
            this.logger.log(`Found WABA ID via direct app scan: ${wabaId}`);
         }
       } catch (err: any) {
         this.logger.warn(`Final direct scan failed: ${err.message}`);
       }
    }

    if (!wabaId) {
       this.logger.log(`Wait... scanning client WABAs manually as absolute final fallback...`);
       try {
         const clientWabasRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${appId}/client_whatsapp_business_accounts`, {
           headers: { Authorization: `Bearer ${systemAccessToken}` }
         });
         const clientWabas = clientWabasRes.data.data;
         if (clientWabas && clientWabas.length > 0) {
            wabaId = clientWabas[0].id;
            this.logger.log(`Found WABA ID via direct app scan: ${wabaId}`);
         }
       } catch (err: any) {
         this.logger.warn(`Final direct scan failed: ${err.message}`);
       }
    }

    if (!wabaId) {
      this.logger.error(`CRITICAL: No WABA ID found. App ID: ${appId}`);
      throw new HttpException(
        'Could not determine WhatsApp Business Account ID. Please ensure the Meta embedded signup was completed.',
        HttpStatus.BAD_REQUEST
      );
    }

    // 4. Use SYSTEM USER TOKEN to get phone numbers
    this.logger.log(`STEP 2: Fetching phone numbers for WABA ${wabaId} using System Token...`);
    let phoneData: any;
    try {
      const phoneRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${systemAccessToken}` },
      });
      phoneData = phoneRes.data.data?.[0];
    } catch (phoneErr: any) {
      const errorMsg = phoneErr.response?.data?.error?.message || phoneErr.message;
      this.logger.error(`CRITICAL FAILURE: System Token Fetch failed. Message: ${errorMsg}`);
      
      if (errorMsg.toLowerCase().includes('expired') || errorMsg.toLowerCase().includes('session')) {
        this.logger.error('ACTION REQUIRED: Your WHATSAPP_ACCESS_TOKEN has EXPIRED. Please generate a new one in Meta Business Suite.');
      }
      
      throw new HttpException(`WhatsApp connection failed: ${errorMsg}`, HttpStatus.BAD_REQUEST);
    }

    if (!phoneData) {
      throw new HttpException('No phone numbers found in the connected WABA.', HttpStatus.BAD_REQUEST);
    }

    const { id: extractedPhoneId, display_phone_number: phoneNumber, verified_name: displayName } = phoneData;
    phoneNumberId = extractedPhoneId;

    // 5. Store the powerful System Access Token directly, as it doesn't expire and grants access to this WABA
    const encryptedToken = this.securityService.encrypt(systemAccessToken);

    // 5. Generate security tokens for webhooks
    const verifyToken = this.securityService.generateRandomToken(16);
    const webhookSecret = this.securityService.generateRandomToken(32);

    if (!phoneNumberId) {
      throw new HttpException('Failed to resolve Phone Number ID from Meta.', HttpStatus.BAD_REQUEST);
    }

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
