import { Injectable, Logger, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/services/security.service';
import { WebhookEventType, MessageType } from '@prisma/client';
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
   */
  async sendTextMessage(orgId: string, accountId: string, to: string, message: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });

    if (!account) {
      throw new ConflictException('WhatsApp account not found or access denied');
    }

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

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
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });

    if (!account) {
      throw new ConflictException('WhatsApp account not found or access denied');
    }

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
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

  /**
   * Uploads a file to Meta's media endpoint to get a media_id.
   */
  async uploadMedia(orgId: string, accountId: string, file: any) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/media`;

    const formData = new FormData();
    formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    formData.append('type', file.mimetype);
    formData.append('messaging_product', 'whatsapp');

    try {
      this.logger.log(`Uploading media to Meta for org ${orgId} via account ${accountId}...`);
      const response = await axios.post(url, formData, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to upload media via account ${accountId}`);
    }
  }

  /**
   * Sends a media message (image, video, document, audio) using a media_id.
   */
  async sendMediaMessage(orgId: string, accountId: string, to: string, type: MessageType, mediaId: string, caption?: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const mediaTypeKey = type.toLowerCase();
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaTypeKey,
      [mediaTypeKey]: {
        id: mediaId,
      },
    };

    if (caption && (type === MessageType.IMAGE || type === MessageType.VIDEO)) {
      payload[mediaTypeKey].caption = caption;
    }

    try {
      this.logger.log(`Sending WhatsApp ${type} message for org ${orgId} to ${to}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send ${type} message via account ${accountId}`);
    }
  }

  /**
   * Lists all WhatsApp accounts belonging to an organization.
   */
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
      
      const metaTemplates = response.data.data || [];

      // Enrich with local mappings
      const localTemplates = await this.prisma.whatsAppTemplate.findMany({
        where: { accountId, organizationId: orgId }
      });

      return metaTemplates.map((mt: any) => {
        const local = localTemplates.find(lt => lt.name === mt.name && lt.language === mt.language);
        return {
          ...mt,
          variableMapping: local?.variableMapping || {},
        };
      });
    } catch (error) {
      this.handleError(error, `Failed to fetch templates via account ${accountId}`);
    }
  }

  /**
   * Creates a new message template in Meta.
   */
  async createTemplate(orgId: string, accountId: string, data: any) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;

    // 1. Extract variable mapping and samples if provided
    const variableMapping = data.variableMapping || {}; // { "1": "firstName", "2": "custom:EnglishMarks" }
    const sampleValues = data.sampleValues || {}; // { "firstName": "John", "custom:EnglishMarks": "85" }

    // 2. Prepare Meta Payload (Inject examples)
    const metaPayload = { ...data };
    delete metaPayload.variableMapping;
    delete metaPayload.sampleValues;

    if (Object.keys(variableMapping).length > 0) {
      metaPayload.components = metaPayload.components.map((comp: any) => {
        if (comp.type === 'BODY') {
          const bodySamples = Object.keys(variableMapping)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(index => {
              const fieldName = variableMapping[index];
              return sampleValues[fieldName] || `Sample ${index}`;
            });

          if (bodySamples.length > 0) {
            comp.example = {
              body_text: [bodySamples]
            };
          }
        }
        return comp;
      });
    }

    try {
      this.logger.log(`Creating WhatsApp template ${data.name} for org ${orgId} with ${Object.keys(variableMapping).length} variables`);
      const response = await axios.post(url, metaPayload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });

      // 3. Store mapping locally for broadcast resolution
      await this.prisma.whatsAppTemplate.upsert({
        where: {
          accountId_name_language: {
            accountId,
            name: data.name,
            language: data.language
          }
        },
        create: {
          organizationId: orgId,
          accountId,
          name: data.name,
          language: data.language,
          category: data.category,
          components: data.components,
          variableMapping,
        },
        update: {
          components: data.components,
          variableMapping,
        }
      });

      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to create template via account ${accountId}`);
    }
  }

  /**
   * Updates an existing message template in Meta.
   */
  async updateTemplate(orgId: string, accountId: string, templateId: string, data: any) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${templateId}`;

    try {
      this.logger.log(`Updating WhatsApp template ${templateId} for org ${orgId}`);
      const response = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to update template ${templateId}`);
    }
  }

  /**
   * Deletes a message template from Meta.
   */
  async deleteTemplate(orgId: string, accountId: string, templateName: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;

    try {
      this.logger.log(`Deleting WhatsApp template ${templateName} for org ${orgId}`);
      const response = await axios.delete(url, {
        params: { name: templateName },
        headers: {
          Authorization: `Bearer ${validatedToken}`,
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to delete template ${templateName}`);
    }
  }

  /**
   * Synchronizes account details (quality, limits) from Meta.
   */
  async syncAccount(orgId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    
    if (!account) {
      throw new HttpException('WhatsApp Account not found or access denied.', HttpStatus.NOT_FOUND);
    }

    if (!account.wabaId || !account.phoneNumberId) {
      throw new HttpException('Incomplete account data (missing WABA or Phone ID). Try reconnecting.', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`[SYNC] Starting sync for account ${accountId} (WABA: ${account.wabaId})`);
      const { token: validatedToken } = await this.getValidToken(account);

      const phoneRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/phone_numbers`, {
        params: { fields: 'display_phone_number,quality_rating,messaging_limit_tier,verified_name,code_verification_status,name_status' },
        headers: { Authorization: `Bearer ${validatedToken}` },
      });

      const phoneData = phoneRes.data?.data || [];
      const phoneInfo = phoneData.find((p: any) => p.id === account.phoneNumberId);
      
      if (!phoneInfo) {
        this.logger.error(`[SYNC FAILURE] Phone number ${account.phoneNumberId} missing in WABA ${account.wabaId}. Avail IDs: ${phoneData.map((p:any)=>p.id).join(', ')}`);
        throw new HttpException('Your Phone Number ID is no longer associated with this Meta WABA.', HttpStatus.UNAUTHORIZED);
      }

      const tierMapping: any = {
        'TIER_1000': 1000,
        'TIER_10000': 10000,
        'TIER_100000': 100000,
        'TIER_UNLIMITED': 1000000
      };

      const tier = phoneInfo.messaging_limit_tier || 'TIER_1000';
      const count = tierMapping[tier] || 1000;

      let businessProfile: any = {};
      try {
        businessProfile = {
          ...(typeof account.businessProfile === 'object' ? (account.businessProfile as any) : {}),
          qualityRating: (phoneInfo.quality_rating || 'UNKNOWN').toUpperCase(),
          nameStatus: phoneInfo.name_status || 'UNKNOWN',
          lastSyncAt: new Date().toISOString(),
        };
      } catch (profileErr) {
        this.logger.error(`[SYNC] Failed to merge business profile JSON for account ${accountId}: ${profileErr.message}`);
        // Fallback to minimal profile if merge fails
        businessProfile = { lastSyncAt: new Date().toISOString() };
      }

      this.logger.log(`[SYNC] Attempting database update for account ${accountId} with: ${JSON.stringify({ 
        name: phoneInfo.verified_name,
        tier,
        status: phoneInfo.code_verification_status
      })}`);

      const updatedAccount = await this.prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: {
          displayName: phoneInfo.verified_name || account.displayName,
          status: phoneInfo.code_verification_status === 'VERIFIED' ? 'ACTIVE' : 'INACTIVE',
          messagingLimitTier: tier,
          messagingLimitCount: count,
          businessProfile,
        },
      });

      this.logger.log(`[SYNC SUCCESS] Account ${accountId} updated. Status: ${updatedAccount.status}`);
      return updatedAccount;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.handleError(error, `Synchronization failed`);
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
    
    return this.prisma.whatsAppAccount.delete({
      where: { id: accountId },
    });
  }

  /**
   * Robustly gets a valid access token for an account.
   */
  private async getValidToken(account: any): Promise<{ token: string; wasUpdated: boolean }> {
    const storedToken = this.securityService.decrypt(account.accessToken);
    const globalToken = this.configService.get<string>('whatsapp.accessToken');

    try {
      // 1. Test the stored token via debug endpoint
      // Note: input_token needs to be checked against a system token for best results
      await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
        params: { input_token: storedToken },
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      return { token: storedToken, wasUpdated: false };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      this.logger.warn(`Token validation failed for ${account.id}: ${errorMsg}`);

      // 2. Fallback to global System Token if the stored one failed (e.g. expired or restricted)
      if (globalToken && globalToken !== storedToken) {
        this.logger.log(`Attempting global token fallback for account ${account.id}...`);
        try {
          await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
            params: { input_token: globalToken },
            headers: { Authorization: `Bearer ${globalToken}` },
          });
          
          await this.prisma.whatsAppAccount.update({
            where: { id: account.id },
            data: { accessToken: this.securityService.encrypt(globalToken) },
          });
          
          return { token: globalToken, wasUpdated: true };
        } catch (globalErr) {
          this.logger.error(`CRITICAL: Global system token is also invalid.`);
          throw error;
        }
      }
      
      // If no fallback available, throw clear error
      throw new HttpException(`WhatsApp authentication failed: ${errorMsg}. Your token may have expired.`, HttpStatus.UNAUTHORIZED);
    }
  }

  private handleError(error: any, contextMessage: string): never {
    const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    const errorData = error.response?.data?.error || error.response?.data || { message: 'Unknown WhatsApp API error' };
    
    // Log the full error data for engineering diagnostics
    this.logger.error(`[WHATSAPP_ERROR] ${contextMessage} (Status: ${status}):`, JSON.stringify(errorData));
    
    const metaMessage = errorData.message || 'WhatsApp API Error';
    const enhancedMessage = `${contextMessage}: ${metaMessage}`;

    throw new HttpException(
      { success: false, message: enhancedMessage, details: errorData },
      status,
    );
  }
}
