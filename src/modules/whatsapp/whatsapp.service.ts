import { Injectable, Logger, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityService } from '../../common/services/security.service';
import { WebhookEventType, MessageType } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';

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
      const allPhones = phoneRes.data.data || [];

      // Prioritize the phoneNumberId passed from frontend/onboarding
      phoneData = phoneNumberId
        ? allPhones.find((p: any) => p.id === phoneNumberId)
        : allPhones[0];

      if (!phoneData && allPhones.length > 0) {
        if (phoneNumberId) {
          this.logger.warn(`Provided phoneNumberId ${phoneNumberId} not found in WABA ${wabaId}. Falling back to first available: ${allPhones[0].id}`);
        }
        phoneData = allPhones[0];
      }
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
        // IMPORTANT: Use the stable System Access Token for these operations
        const operationToken = systemAccessToken;

        // Subscribe the WABA to our App's webhooks
        await axios.post(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/subscribed_apps`, {}, {
          headers: { Authorization: `Bearer ${operationToken}` },
        });
        this.logger.log(`WABA ${wabaId} subscribed to webhooks successfully.`);

        // Also register phone number for Cloud API use (Smart Registration)
        await this.registerPhoneNumber(orgId, account.id, true); // Force on first connect

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

  async uploadTemplateMedia(orgId: string, accountId: string, file: any) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new HttpException('Account not found', HttpStatus.NOT_FOUND);

    const { token: validatedToken } = await this.getValidToken(account);
    const appId = this.configService.get<string>('whatsapp.appId');

    if (!appId) {
      this.logger.error('CRITICAL: WHATSAPP_APP_ID is not configured in environment.');
      throw new HttpException('Media upload failed: Meta App ID is missing in server configuration.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (!file) {
      this.logger.error('Upload failed: Multer file object is undefined.');
      throw new HttpException('No file provided for upload. Check your multipart/form-data configuration.', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`[RESUMABLE UPLOAD] STEP 1: Creating Session for ${file.originalname} (${file.size} bytes)`);

      // 1. Create Upload Session
      const sessionRes = await axios.post(`${this.graphBaseUrl}/${this.apiVersion}/${appId}/uploads`, null, {
        params: {
          file_length: file.size,
          file_type: file.mimetype,
          access_token: validatedToken,
        },
      });

      const sessionId = sessionRes.data.id;
      this.logger.log(`[RESUMABLE UPLOAD] STEP 2: Uploading data to session ${sessionId}...`);

      // 2. Upload the file data (Standardizing to Bearer for consistency)
      const uploadRes = await axios.post(`${this.graphBaseUrl}/${this.apiVersion}/${sessionId}`, file.buffer, {
        headers: {
          'Authorization': `Bearer ${validatedToken}`,
          'file_offset': '0',
          'Content-Type': 'application/octet-stream',
          'Content-Length': file.size.toString(),
        },
      });

      const handle = uploadRes.data.h;
      if (!handle) {
        this.logger.error(`[RESUMABLE UPLOAD] FAILURE: No handle returned. Response: ${JSON.stringify(uploadRes.data)}`);
        throw new Error('Meta did not return a header handle after successful upload.');
      }

      this.logger.log(`[RESUMABLE UPLOAD] SUCCESS: Received header_handle: ${handle}`);

      return { handle };
    } catch (error) {
      this.handleError(error, `Resumable upload failed for template media`);
    }
  }

  /**
   * Handles media upload for broadcast template headers.
   *
   * WHY we save to disk and return a URL (not upload to Meta's media API):
   * Meta error 131053 ("Media upload error") occurs when using media_ids from
   * the /phone_numbers/{id}/media API in template message component parameters.
   * That API is for regular messaging, not template header components.
   * Meta's template delivery pipeline cannot reliably resolve those media_ids.
   *
   * The RELIABLE solution: save the file locally, serve it publicly via our backend,
   * and use that URL as { link: url } in the template component — exactly like the
   * "Link URL" mode that already works perfectly.
   */
  async uploadMedia(orgId: string, accountId: string, file: any) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    if (!file || !file.buffer) {
      this.logger.error(`[uploadMedia] No file buffer received. File: ${JSON.stringify({ name: file?.originalname, size: file?.size })}`);
      throw new HttpException('No file buffer received. Ensure the request uses multipart/form-data.', HttpStatus.BAD_REQUEST);
    }

    try {
      const fs = require('fs');
      const path = require('path');

      // Generate a unique filename to avoid collisions
      const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1] || 'bin'}`;
      const uniqueName = `broadcast_${orgId.slice(0, 8)}_${Date.now()}`; // Cloudinary might add its own ext, so just use name

      const cloudName = this.configService.get<string>('cloudinary.cloudName');
      const apiKey = this.configService.get<string>('cloudinary.apiKey');
      const apiSecret = this.configService.get<string>('cloudinary.apiSecret');

      let publicUrl = '';
      let filenameToReturn = uniqueName + ext;

      if (cloudName && apiKey && apiSecret) {
        // Use Cloudinary
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });

        // Determine resource type based on mimetype
        let resourceType = 'auto';
        if (file.mimetype.startsWith('image/')) resourceType = 'image';
        else if (file.mimetype.startsWith('video/')) resourceType = 'video';
        else resourceType = 'raw'; // For documents

        this.logger.log(`[uploadMedia] Uploading to Cloudinary... (${resourceType})`);
        
        publicUrl = await new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: resourceType,
              public_id: uniqueName,
              folder: `bizzriser_media/${orgId}`,
            },
            (error: any, result: any) => {
              if (error) {
                this.logger.error(`Cloudinary upload failed: ${JSON.stringify(error)}`);
                reject(error);
              } else {
                // IMPORTANT: WhatsApp API strictly requires media URLs to have a valid file extension.
                // Cloudinary strips extensions from the secure_url by default for images/videos.
                // We MUST append the original extension if it's missing, otherwise Meta throws error 131053.
                let finalUrl = result.secure_url;
                if (!finalUrl.endsWith(ext) && !finalUrl.includes('?')) {
                  finalUrl = `${finalUrl}${ext}`;
                }
                resolve(finalUrl);
              }
            }
          );
          
          const streamifier = require('streamifier');
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });

        this.logger.log(`[uploadMedia] Cloudinary Upload SUCCESS → ${publicUrl}`);
      } else {
        // Fallback to local disk (won't work for Meta if localhost, but fine for Render)
        this.logger.log('[uploadMedia] Cloudinary not configured. Falling back to local disk storage.');
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        filenameToReturn = uniqueName + ext;
        const filePath = path.join(uploadsDir, filenameToReturn);
        fs.writeFileSync(filePath, file.buffer);

        const backendUrl = this.configService.get<string>('app.publicUrl') || 'http://localhost:3001';
        publicUrl = `${backendUrl}/uploads/${filenameToReturn}`;

        this.logger.log(`[uploadMedia] Saved locally (${file.size} bytes) → ${publicUrl}`);
      }

      // Return a URL that Meta can download from
      return { 
        id: publicUrl,       // Stored as 'id' in paramMapping for compatibility
        url: publicUrl,      // Explicit url field
        filename: filenameToReturn 
      };
    } catch (error) {
      this.logger.error(`[uploadMedia] Failed to process media upload: ${error.message}`);
      throw new HttpException(`Failed to process media upload: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  /**
   * Resolves a Meta Media ID into a temporary download URL.
   */
  async getMediaUrl(orgId: string, accountId: string, mediaId: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${mediaId}`;

    try {
      this.logger.log(`Fetching media URL for ID: ${mediaId} via account ${accountId}`);
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
        },
      });
      return response.data.url;
    } catch (error) {
      this.handleError(error, `Failed to fetch media URL for ID ${mediaId}`);
    }
  }

  async downloadMedia(orgId: string, accountId: string, mediaId: string) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const metadataUrl = `${this.graphBaseUrl}/${this.apiVersion}/${mediaId}`;

    try {
      this.logger.log(`Fetching media metadata for ID: ${mediaId} via account ${accountId}`);
      const metadataRes = await axios.get(metadataUrl, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
        },
      });
      const downloadUrl = metadataRes.data.url;
      const mimeType = metadataRes.data.mime_type;

      this.logger.log(`Downloading media stream from Meta for ID: ${mediaId}...`);
      const response = await axios.get(downloadUrl, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
        },
        responseType: 'stream',
      });
      return { stream: response.data, mimeType };
    } catch (error) {
      this.handleError(error, `Failed to download media for ID ${mediaId}`);
      throw error;
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
   * Sends media by a public URL (for use in chatbot flows).
   * Supports both URL-based and pre-uploaded mediaId delivery.
   */
  async sendMediaByUrl(
    orgId: string,
    accountId: string,
    to: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string,
    filename?: string,
  ) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const mediaObj: any = { link: mediaUrl };
    if (caption && (mediaType === 'image' || mediaType === 'video')) {
      mediaObj.caption = caption;
    }
    if (filename && mediaType === 'document') {
      mediaObj.filename = filename;
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaObj,
    };

    try {
      this.logger.log(`Sending WhatsApp ${mediaType} (URL) for org ${orgId} to ${to}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send ${mediaType} URL message via account ${accountId}`);
    }
  }

  /**
   * Sends an interactive message with up to 3 quick-reply buttons.
   * Used by the SendButton node in chatbot flows.
   */
  async sendInteractiveButtons(
    orgId: string,
    accountId: string,
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string,
  ) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((btn) => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title.substring(0, 20) },
          })),
        },
      },
    };

    if (headerText) {
      payload.interactive.header = { type: 'text', text: headerText };
    }
    if (footerText) {
      payload.interactive.footer = { text: footerText };
    }

    try {
      this.logger.log(`Sending WhatsApp interactive buttons for org ${orgId} to ${to}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send interactive buttons via account ${accountId}`);
    }
  }

  /**
   * Sends an interactive list menu message.
   * Used by the SendList node in chatbot flows.
   */
  async sendInteractiveList(
    orgId: string,
    accountId: string,
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    headerText?: string,
    footerText?: string,
  ) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText.substring(0, 20),
          sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.substring(0, 24),
              ...(r.description ? { description: r.description.substring(0, 72) } : {}),
            })),
          })),
        },
      },
    };

    if (headerText) {
      payload.interactive.header = { type: 'text', text: headerText };
    }
    if (footerText) {
      payload.interactive.footer = { text: footerText };
    }

    try {
      this.logger.log(`Sending WhatsApp interactive list for org ${orgId} to ${to}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send interactive list via account ${accountId}`);
    }
  }


  /**
   * Lists all WhatsApp accounts belonging to an organization.
   */
  /**
   * Lists WhatsApp accounts belonging to an organization, filtered by user assignment.
   */
  async listAccounts(orgId: string, user: { role: string; sub: string }) {
    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN';

    return this.prisma.whatsAppAccount.findMany({
      where: {
        organizationId: orgId,
        ...(isAdmin ? {} : {
          accountAccess: {
            some: { userId: user.sub }
          }
        })
      },
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
   * Fetches message templates for a WhatsApp Business Account.
   * By default, returns locally cached templates. If forceSync is true, fetches from Meta.
   */
  async getTemplates(orgId: string, accountId: string, forceSync = false) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    // 1. If not forcing a sync, return from local database immediately (FAST)
    if (!forceSync) {
      this.logger.log(`[Templates] Fetching cached templates for account ${accountId} (Local DB)`);
      return this.prisma.whatsAppTemplate.findMany({
        where: { accountId, organizationId: orgId, isActive: true },
        orderBy: { updatedAt: 'desc' }
      });
    }

    // 2. Otherwise, fetch from Meta Graph API (SLOW)
    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;

    try {
      this.logger.log(`[Templates] Forcing synchronization from Meta for account ${accountId}...`);
      const response = await axios.get(url, {
        params: { limit: 100 },
        headers: {
          Authorization: `Bearer ${validatedToken}`,
        },
      });

      const metaTemplates = response.data.data || [];
      this.logger.log(`[Templates] Received ${metaTemplates.length} templates from Meta API.`);

      // 3. Sync meta templates into local DB
      for (const mt of metaTemplates) {
        await this.prisma.whatsAppTemplate.upsert({
          where: {
            accountId_name_language: {
              accountId,
              name: mt.name,
              language: mt.language
            }
          },
          create: {
            organizationId: orgId,
            accountId,
            name: mt.name,
            language: mt.language,
            category: mt.category,
            status: mt.status || 'APPROVED',
            components: mt.components,
            variableMapping: {},
          },
          update: {
            category: mt.category,
            status: mt.status || 'APPROVED',
            components: mt.components,
            isActive: true
          }
        });
      }

      this.logger.log(`[Templates] Cache update complete for account ${accountId}.`);

      // 4. Return the refreshed local list
      return this.prisma.whatsAppTemplate.findMany({
        where: { accountId, organizationId: orgId, isActive: true },
        orderBy: { updatedAt: 'desc' }
      });
    } catch (error) {
      this.handleError(error, `Failed to fetch and sync templates via account ${accountId}`);
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

    // 1. Prepare Meta Payload (Inject examples recursively)
    const prepareComponents = (components: any[]) => {
      return components.map((comp: any) => {
        // 1. Strip internal fields (starting with _)
        const processed = { ...comp };
        Object.keys(processed).forEach(key => {
          if (key.startsWith('_')) delete processed[key];
        });

        // 2. Handle Body Variables
        if (processed.type === 'BODY' && processed.text) {
          const variableRegex = /\{\{(\d+)\}\}/g;
          const detectedIndices: number[] = [];
          let match;
          while ((match = variableRegex.exec(processed.text)) !== null) {
            detectedIndices.push(parseInt(match[1]));
          }

          if (detectedIndices.length > 0) {
            const sortedIndices = [...new Set(detectedIndices)].sort((a, b) => a - b);
            const bodySamples = sortedIndices.map(index => {
              const fieldName = data.variableMapping?.[index.toString()];
              return data.sampleValues?.[fieldName] || `Sample ${index}`;
            });
            processed.example = { body_text: [bodySamples] };
          }
        }

        // 3. Handle Header Media Examples (Meta requirement for IMAGE/VIDEO)
        if (processed.type === 'HEADER' && (processed.format === 'IMAGE' || processed.format === 'VIDEO')) {
          if (processed.example?.header_handle) {
            processed.example = processed.example;
          }
        }

        // 4. Handle Carousel (Recursive)
        if (processed.type === 'CAROUSEL' && processed.cards) {
          processed.cards = processed.cards.map((card: any) => {
            const cleanedCard = { ...card };
            Object.keys(cleanedCard).forEach(k => k.startsWith('_') && delete cleanedCard[k]);
            return {
              ...cleanedCard,
              components: prepareComponents(card.components)
            };
          });
        }

        return processed;
      });
    };

    const metaPayload = {
      name: data.name,
      language: data.language,
      category: data.category,
      components: prepareComponents(data.components)
    };

    try {
      this.logger.log(`Creating WhatsApp template ${data.name} for org ${orgId}...`);
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
          variableMapping: data.variableMapping || {},
        },
        update: {
          components: data.components,
          variableMapping: data.variableMapping || {},
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
        this.logger.error(`[SYNC FAILURE] Phone number ${account.phoneNumberId} missing in WABA ${account.wabaId}. Avail IDs: ${phoneData.map((p: any) => p.id).join(', ')}`);
        throw new HttpException('Your Phone Number ID is no longer associated with this Meta WABA.', HttpStatus.UNAUTHORIZED);
      }

      const tierMapping: any = {
        'TIER_250': '250',
        'TIER_1000': '1K',
        'TIER_10000': '10K',
        'TIER_100000': '100K',
        'TIER_UNLIMITED': 'Unlimited'
      };

      const tier = phoneInfo.messaging_limit_tier || 'TIER_1000';
      const limitLabel = tierMapping[tier] || tier;

      let businessProfile: any = {};
      try {
        businessProfile = {
          ...(typeof account.businessProfile === 'object' ? (account.businessProfile as any) : {}),
          qualityRating: (phoneInfo.quality_rating || 'UNKNOWN').toUpperCase(),
          nameStatus: phoneInfo.name_status || 'UNKNOWN',
          messagingLimit: limitLabel,
          lastSyncAt: new Date().toISOString(),
        };
      } catch (profileErr) {
        this.logger.error(`[SYNC] Failed to merge business profile JSON for account ${accountId}: ${profileErr.message}`);
        businessProfile = { 
          qualityRating: (phoneInfo.quality_rating || 'UNKNOWN').toUpperCase(),
          nameStatus: phoneInfo.name_status || 'UNKNOWN',
          messagingLimit: limitLabel,
          lastSyncAt: new Date().toISOString() 
        };
      }

      this.logger.log(`[SYNC] Updating account ${accountId} with tier: ${tier} (${limitLabel})`);

      const updatedAccount = await this.prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: {
          displayName: phoneInfo.verified_name || account.displayName,
          status: phoneInfo.code_verification_status === 'VERIFIED' ? 'ACTIVE' : 'INACTIVE',
          messagingLimitTier: tier,
          messagingLimitCount: parseInt(limitLabel.replace(/\D/g, '')) * (limitLabel.includes('K') ? 1000 : 1) || 1000,
          businessProfile,
        },
      });

      // NEW: If the account is still not verified, trigger a smart registration attempt
      if (phoneInfo.code_verification_status !== 'VERIFIED') {
        this.logger.log(`[SYNC] Account ${accountId} is not VERIFIED (Status: ${phoneInfo.code_verification_status}). Triggering smart registration...`);
        // Use force=true during manual sync to bypass the 12-hour cooldown
        this.registerPhoneNumber(orgId, accountId, true).catch(err => {
          this.logger.error(`[SYNC] Auto-registration failed during sync: ${err.message}`);
        });
      }

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

  /**
   * Registers a phone number for WhatsApp Cloud API.
   * Includes smart checks to avoid exceeding Meta's rate limits (10 attempts / 72 hours).
   */
  async registerPhoneNumber(orgId: string, accountId: string, force = false) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) return;

    try {
      this.logger.log(`[Registration] Starting smart registration check for ${account.phoneNumberId}...`);

      // Use the system token for registration as it's more reliable
      const systemToken = this.configService.get<string>('whatsapp.accessToken');
      const { token: validatedToken } = await this.getValidToken(account);
      const registrationToken = systemToken || validatedToken;

      // 1. Fetch current status from Meta to see if registration is actually needed
      const phoneRes = await axios.get(`${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/phone_numbers`, {
        params: { fields: 'code_verification_status,display_phone_number' },
        headers: { Authorization: `Bearer ${registrationToken}` },
      });
      const phoneInfo = phoneRes.data?.data?.find((p: any) => p.id === account.phoneNumberId);

      this.logger.log(`[Registration] Meta status for ${account.phoneNumberId} (${phoneInfo?.display_phone_number}): ${phoneInfo?.code_verification_status}`);

      // We only skip if it's VERIFIED AND we have a record of a recent successful registration
      const profile = typeof account.businessProfile === 'object' ? (account.businessProfile as any) : {};
      if (phoneInfo?.code_verification_status === 'VERIFIED' && profile.registrationStatus === 'SUCCESS' && !force) {
        this.logger.log(`[Registration] Phone number ${account.phoneNumberId} is already VERIFIED and registered. Skipping.`);
        return;
      }

      // 2. Cooldown check: Don't attempt more than once every 12 hours unless forced
      const lastAttempt = profile.lastRegistrationAttemptAt ? new Date(profile.lastRegistrationAttemptAt) : null;
      const cooldownMs = 12 * 60 * 60 * 1000; // 12 hours

      if (lastAttempt && (Date.now() - lastAttempt.getTime() < cooldownMs) && !force) {
        this.logger.warn(`[Registration] Registration cooldown active for ${account.phoneNumberId}. Skipping. Last attempt: ${lastAttempt.toISOString()}`);
        return;
      }

      // 3. Perform the actual registration
      this.logger.log(`[Registration] Sending registration request for ${account.phoneNumberId} (PIN: 123456) using token: ${registrationToken.substring(0, 10)}...`);
      const regRes = await axios.post(`${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/register`, {
        messaging_product: 'whatsapp',
        pin: '123456',
      }, {
        headers: { Authorization: `Bearer ${registrationToken}` },
      });

      this.logger.log(`[Registration] SUCCESS: Phone number ${account.phoneNumberId} registered. Meta response: ${JSON.stringify(regRes.data)}`);

      // 4. Update local state and timestamp
      await this.prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: {
          status: 'ACTIVE',
          businessProfile: {
            ...profile,
            lastRegistrationAttemptAt: new Date().toISOString(),
            registrationStatus: 'SUCCESS',
            metaRegistrationResponse: regRes.data
          }
        }
      });

    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const errorMsg = errorData?.message || error.message;
      const errorCode = errorData?.code;
      const errorSubcode = errorData?.error_subcode;

      this.logger.error(`[Registration] FAILED for ${account.phoneNumberId}: ${errorMsg} (Code: ${errorCode}, Subcode: ${errorSubcode})`);

      // Update attempt timestamp even on failure to respect cooldown
      const profile = typeof account.businessProfile === 'object' ? (account.businessProfile as any) : {};
      await this.prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: {
          businessProfile: {
            ...profile,
            lastRegistrationAttemptAt: new Date().toISOString(),
            registrationError: errorMsg,
            metaErrorCode: errorCode,
            metaErrorSubcode: errorSubcode
          }
        }
      });
    }
  }

  async sendLocationMessage(orgId: string, accountId: string, to: string, data: { latitude: number; longitude: number; name?: string; address?: string }) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'location',
      location: {
        latitude: data.latitude,
        longitude: data.longitude,
        name: data.name,
        address: data.address,
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send location message via account ${accountId}`);
    }
  }

  async sendContactMessage(orgId: string, accountId: string, to: string, contacts: any[]) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'contacts',
      contacts: contacts.map(c => ({
        name: { formatted_name: c.name, first_name: c.firstName, last_name: c.lastName },
        phones: [{ phone: c.phone, type: 'CELL' }],
        emails: c.email ? [{ email: c.email, type: 'WORK' }] : undefined,
        org: c.company ? { company: c.company } : undefined
      })),
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send contacts via account ${accountId}`);
    }
  }

  async sendCTAButtonMessage(orgId: string, accountId: string, to: string, data: { body: string; footer?: string; header?: string; buttonLabel: string; url: string }) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('WhatsApp account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        header: data.header ? { type: 'text', text: data.header } : undefined,
        body: { text: data.body },
        footer: data.footer ? { text: data.footer } : undefined,
        action: {
          name: 'cta_url',
          parameters: {
            display_text: data.buttonLabel,
            url: data.url,
          },
        },
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send CTA button message`);
    }
  }

  async sendFlowMessage(orgId: string, accountId: string, to: string, data: { body: string; footer?: string; flowId: string; flowToken: string; flowCta: string; flowMode?: 'draft' | 'published'; screen?: string; payload?: any }) {
     const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: data.body },
        footer: data.footer ? { text: data.footer } : undefined,
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: data.flowId,
            flow_token: data.flowToken,
            flow_mode: data.flowMode || 'published',
            flow_cta: data.flowCta,
            flow_action: 'navigate',
            flow_action_payload: {
              screen: data.screen || 'START',
              data: data.payload || {},
            },
          },
        },
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
        this.handleError(error, `Failed to send flow message`);
    }
  }

  async sendCarouselMessage(orgId: string, accountId: string, to: string, data: { body: string; cards: any[] }) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: data.body },
        action: {
          cards: data.cards.map((card: any) => ({
            header: {
              type: card.headerType || 'image',
              [card.headerType || 'image']: { link: card.headerUrl },
            },
            body: card.body ? { text: card.body } : undefined,
            buttons: (card.buttons || []).map((btn: any) => {
              if (btn.type === 'reply') {
                return {
                  type: 'reply',
                  reply: { id: btn.id || uuidv4(), title: btn.label },
                };
              } else if (btn.type === 'url') {
                return {
                  type: 'cta_url',
                  cta_url: { display_text: btn.label, url: btn.url },
                };
              }
              return null;
            }).filter(Boolean),
          })),
        },
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
        this.handleError(error, `Failed to send carousel message`);
    }
  }

  async sendCallRequestMessage(orgId: string, accountId: string, to: string, data: { body: string; footer?: string }) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: data.body },
        footer: data.footer ? { text: data.footer } : undefined,
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'call_approve', title: 'Approve' } },
            { type: 'reply', reply: { id: 'call_decline', title: 'Decline' } },
          ],
        },
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
        this.handleError(error, `Failed to send call request`);
    }
  }

  async sendPaymentMessage(orgId: string, accountId: string, to: string, data: { 
    body: string; 
    footer?: string; 
    referenceId: string; 
    amount: number; 
    currency: string; 
    gateway: string; 
    configId: string;
    razorpayReceipt?: string;
    razorpayNotes?: any;
  }) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new ConflictException('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\+/g, ''),
      type: 'interactive',
      interactive: {
        type: 'order_details',
        body: { text: data.body },
        footer: data.footer ? { text: data.footer } : undefined,
        action: {
          name: 'review_and_pay',
          parameters: {
            reference_id: data.referenceId,
            type: 'checkout-payment',
            payment_settings: [
              {
                type: 'payment_gateway',
                payment_gateway: {
                  type: data.gateway,
                  configuration_id: data.configId,
                  [data.gateway]: data.gateway === 'razorpay' ? {
                    receipt: data.razorpayReceipt,
                    notes: data.razorpayNotes || {}
                  } : {}
                }
              }
            ],
            currency: data.currency || 'INR',
            total_amount: {
              value: Math.round(data.amount * 100),
              offset: 100
            },
            order: {
              items: [
                {
                  name: 'Order Payment',
                  amount: { value: Math.round(data.amount * 100), offset: 100 },
                  quantity: 1
                }
              ]
            }
          }
        }
      }
    };

    try {
      this.logger.log(`Sending WhatsApp payment message for org ${orgId} to ${to}`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${validatedToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send payment message via account ${accountId}`);
    }
  }

  /**
   * Searches for products in a Meta Catalog.
   */
  async searchCatalogProducts(orgId: string, accountId: string, catalogId: string, query: string, searchFields: string[] = ['name']) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new Error('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${catalogId}/products`;

    // Construct filter based on search fields
    // Meta supports basic filters. If multiple fields, we might need multiple calls or a more complex query.
    // For now, we search primarily in 'name' as it's the most common use case.
    const filter: any = {};
    if (query) {
       filter.name = { contains: query };
    }

    try {
      const response = await axios.get(url, {
        params: {
          filter: JSON.stringify(filter),
          fields: 'id,name,description,image_url,retailer_id,price,currency,category',
          limit: 100
        },
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data.data || [];
    } catch (error) {
      this.logger.warn(`Catalog search failed: ${error.message}`);
      return []; // Return empty instead of crashing the flow
    }
  }

  /**
   * Sends a Product List message (Interactive).
   */
  async sendProductListMessage(orgId: string, accountId: string, to: string, data: {
    catalogId: string,
    body: string,
    header?: string,
    footer?: string,
    sections: Array<{ title: string, products: string[] }>
  }) {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: accountId, organizationId: orgId },
    });
    if (!account) throw new Error('Account not found');

    const { token: validatedToken } = await this.getValidToken(account);
    const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: data.header ? { type: 'text', text: data.header } : undefined,
        body: { text: data.body || 'Please select a product:' },
        footer: data.footer ? { text: data.footer } : undefined,
        action: {
          catalog_id: data.catalogId,
          sections: data.sections.map(s => ({
            title: s.title,
            product_items: s.products.map(pid => ({ product_retailer_id: pid }))
          }))
        }
      }
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${validatedToken}` },
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to send product list message`);
    }
  }

  private handleError(error: any, context: string) {
    const errorData = error.response?.data;
    const errorMsg = errorData?.error?.message || errorData?.message || error.message;
    const errorCode = errorData?.error?.code || errorData?.code;
    const errorSubcode = errorData?.error?.error_subcode;

    this.logger.error(`${context}: ${errorMsg} (Code: ${errorCode}, Subcode: ${errorSubcode})`);

    // Log unexpected error structures for debugging
    if (errorData && !errorData.error) {
      this.logger.error(`${context} Full Response: ${JSON.stringify(errorData)}`);
    }

    if (error.response?.status === HttpStatus.UNAUTHORIZED) {
      throw new HttpException(`${context}: Authentication failed. Please reconnect your WhatsApp account.`, HttpStatus.UNAUTHORIZED);
    }

    const formattedError = `WHATSAPP_SVC_V2: ${errorMsg || 'Unknown WhatsApp API error'}${errorCode ? ` (Code: ${errorCode}${errorSubcode ? `, Subcode: ${errorSubcode}` : ''})` : ''}`;

    throw new HttpException(
      `${context}: ${formattedError}`,
      error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
