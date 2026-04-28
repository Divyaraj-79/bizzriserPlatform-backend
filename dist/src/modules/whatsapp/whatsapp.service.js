"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WhatsappService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const security_service_1 = require("../../common/services/security.service");
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
let WhatsappService = WhatsappService_1 = class WhatsappService {
    configService;
    prisma;
    securityService;
    logger = new common_1.Logger(WhatsappService_1.name);
    apiVersion;
    graphBaseUrl;
    http;
    constructor(configService, prisma, securityService) {
        this.configService = configService;
        this.prisma = prisma;
        this.securityService = securityService;
        this.apiVersion = this.configService.get('whatsapp.apiVersion') ?? 'v22.0';
        this.graphBaseUrl = this.configService.get('whatsapp.graphBaseUrl') ?? 'https://graph.facebook.com';
        const appSecret = this.configService.get('whatsapp.appSecret');
        const appId = this.configService.get('whatsapp.appId');
        this.http = axios_1.default.create({
            baseURL: `${this.graphBaseUrl}/${this.apiVersion}`,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async connectAccount(orgId, data) {
        const { code, accessToken: providedToken, wabaId: providedWabaId, phoneNumberId: providedPhoneId } = data;
        const appId = this.configService.get('whatsapp.appId');
        const appSecret = this.configService.get('whatsapp.appSecret');
        const systemAccessToken = this.configService.get('whatsapp.accessToken');
        if (!appId || !appSecret || !systemAccessToken) {
            throw new common_1.HttpException('Meta App ID, Secret, or System Access Token is not configured.', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        let accessToken = providedToken;
        if (code && !accessToken) {
            this.logger.log(`STEP 1: Exchanging code for token...`);
            try {
                const tokenRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/oauth/access_token`, {
                    params: { client_id: appId, client_secret: appSecret, code },
                });
                accessToken = tokenRes.data.access_token;
                this.logger.log('SUCCESS: Clean Token exchange achieved.');
            }
            catch (tokenErr) {
                this.logger.warn(`NOTICE: Clean exchange failed. Retrying with production redirect_uri fallback...`);
                const prodRedirectUri = 'https://bizzriser-platform-frontend-yw8n-sand.vercel.app/whatsapp-account';
                try {
                    const tokenRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/oauth/access_token`, {
                        params: { client_id: appId, client_secret: appSecret, code, redirect_uri: prodRedirectUri },
                    });
                    accessToken = tokenRes.data.access_token;
                    this.logger.log('SUCCESS: Fallback Token exchange achieved.');
                }
                catch (fallbackErr) {
                    this.logger.error(`CRITICAL: All exchange paths failed. Meta response: ${fallbackErr.response?.data?.error?.message || fallbackErr.message}`);
                }
            }
        }
        let wabaId = providedWabaId;
        let phoneNumberId = providedPhoneId;
        if (!wabaId && accessToken) {
            try {
                const debugRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
                    params: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
                });
                const debugData = debugRes.data.data;
                wabaId = debugData.granular_scopes?.find((s) => s.scope === 'whatsapp_business_management')?.target_ids?.[0] ||
                    debugData.granular_scopes?.find((s) => s.scope === 'whatsapp_business_messaging')?.target_ids?.[0] ||
                    debugData.target_ids?.[0] || debugData.profile_id;
                if (wabaId)
                    this.logger.log(`Discovered WABA ID via debug_token: ${wabaId}`);
            }
            catch (debugErr) {
                this.logger.warn(`Debug token discovery skipped: ${debugErr.message}`);
            }
        }
        if (!wabaId) {
            this.logger.log(`Performing Safe Webhook discovery for App ${appId} (Retrying for 5s)...`);
            for (let i = 0; i < 5; i++) {
                if (i > 0)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                    const recentEvents = await this.prisma.webhookEvent.findMany({
                        where: {
                            eventType: client_1.WebhookEventType.MESSAGE_RECEIVED,
                            createdAt: { gte: fiveMinutesAgo }
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                    for (const event of recentEvents) {
                        const payload = event.payload;
                        if (payload.isSignupEvent && payload.waba_info?.partner_app_id === String(appId)) {
                            wabaId = payload.waba_info?.waba_id;
                            this.logger.log(`SUCCESS: Intercepted WABA ID via safe webhook on attempt ${i + 1}: ${wabaId}`);
                            break;
                        }
                    }
                    if (wabaId)
                        break;
                }
                catch (err) {
                    this.logger.warn(`Safe Discovery attempt ${i + 1} failed: ${err.message}`);
                }
            }
        }
        if (!wabaId) {
            this.logger.log(`Wait... scanning client WABAs manually as absolute final fallback...`);
            try {
                const clientWabasRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/${appId}/client_whatsapp_business_accounts`, {
                    headers: { Authorization: `Bearer ${systemAccessToken}` }
                });
                const clientWabas = clientWabasRes.data.data;
                if (clientWabas && clientWabas.length > 0) {
                    wabaId = clientWabas[0].id;
                    this.logger.log(`Found WABA ID via direct app scan: ${wabaId}`);
                }
            }
            catch (err) {
                this.logger.warn(`Final direct scan failed: ${err.message}`);
            }
        }
        if (!wabaId) {
            this.logger.error(`CRITICAL: No WABA ID found. App ID: ${appId}`);
            throw new common_1.HttpException('Could not determine WhatsApp Business Account ID. Please ensure the Meta embedded signup was completed.', common_1.HttpStatus.BAD_REQUEST);
        }
        this.logger.log(`STEP 2: Fetching phone numbers for WABA ${wabaId} using System Token...`);
        let phoneData;
        try {
            const phoneRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/phone_numbers`, {
                headers: { Authorization: `Bearer ${systemAccessToken}` },
            });
            phoneData = phoneRes.data.data?.[0];
        }
        catch (phoneErr) {
            const errorMsg = phoneErr.response?.data?.error?.message || phoneErr.message;
            this.logger.error(`CRITICAL FAILURE: System Token Fetch failed. Message: ${errorMsg}`);
            if (errorMsg.toLowerCase().includes('expired') || errorMsg.toLowerCase().includes('session')) {
                this.logger.error('ACTION REQUIRED: Your WHATSAPP_ACCESS_TOKEN has EXPIRED. Please generate a new one in Meta Business Suite.');
            }
            throw new common_1.HttpException(`WhatsApp connection failed: ${errorMsg}`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (!phoneData) {
            throw new common_1.HttpException('No phone numbers found in the connected WABA.', common_1.HttpStatus.BAD_REQUEST);
        }
        const { id: extractedPhoneId, display_phone_number: phoneNumber, verified_name: displayName } = phoneData;
        phoneNumberId = extractedPhoneId;
        const encryptedToken = this.securityService.encrypt(systemAccessToken);
        const verifyToken = this.securityService.generateRandomToken(16);
        const webhookSecret = this.securityService.generateRandomToken(32);
        if (!phoneNumberId) {
            throw new common_1.HttpException('Failed to resolve Phone Number ID from Meta.', common_1.HttpStatus.BAD_REQUEST);
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
            try {
                await axios_1.default.post(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/subscribed_apps`, {}, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                this.logger.log(`WABA ${wabaId} subscribed to webhooks successfully.`);
                await axios_1.default.post(`${this.graphBaseUrl}/${this.apiVersion}/${phoneNumberId}/register`, {
                    messaging_product: 'whatsapp',
                    pin: '123456',
                }, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                await this.syncAccount(orgId, account.id);
            }
            catch (subErr) {
                this.logger.warn(`Webhook subscription or phone registration failed: ${subErr.response?.data?.error?.message || subErr.message}`);
            }
            return account;
        }
        catch (error) {
            if (error.code === 'P2002') {
                throw new common_1.ConflictException('WhatsApp account with this phone number ID already exists.');
            }
            throw error;
        }
    }
    async sendTextMessage(orgId, accountId, to, message) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account) {
            throw new common_1.ConflictException('WhatsApp account not found or access denied');
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
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to send message via account ${accountId}`);
        }
    }
    async sendTemplateMessage(orgId, accountId, to, templateName, languageCode = 'en_US', components = []) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account) {
            throw new common_1.ConflictException('WhatsApp account not found or access denied');
        }
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;
        const payload = {
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
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to send template message via account ${accountId}`);
        }
    }
    async uploadTemplateMedia(orgId, accountId, file) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.HttpException('Account not found', common_1.HttpStatus.NOT_FOUND);
        const { token: validatedToken } = await this.getValidToken(account);
        const appId = this.configService.get('whatsapp.appId');
        if (!appId) {
            this.logger.error('CRITICAL: WHATSAPP_APP_ID is not configured in environment.');
            throw new common_1.HttpException('Media upload failed: Meta App ID is missing in server configuration.', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        if (!file) {
            this.logger.error('Upload failed: Multer file object is undefined.');
            throw new common_1.HttpException('No file provided for upload. Check your multipart/form-data configuration.', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            this.logger.log(`[RESUMABLE UPLOAD] STEP 1: Creating Session for ${file.originalname} (${file.size} bytes)`);
            const sessionRes = await axios_1.default.post(`${this.graphBaseUrl}/${this.apiVersion}/${appId}/uploads`, null, {
                params: {
                    file_length: file.size,
                    file_type: file.mimetype,
                    access_token: validatedToken,
                },
            });
            const sessionId = sessionRes.data.id;
            this.logger.log(`[RESUMABLE UPLOAD] STEP 2: Uploading data to session ${sessionId}...`);
            const uploadRes = await axios_1.default.post(`${this.graphBaseUrl}/${this.apiVersion}/${sessionId}`, file.buffer, {
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
        }
        catch (error) {
            this.handleError(error, `Resumable upload failed for template media`);
        }
    }
    async uploadMedia(orgId, accountId, file) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        if (!file) {
            throw new common_1.ConflictException('No file provided for upload.');
        }
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/media`;
        const formData = new FormData();
        formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
        formData.append('type', file.mimetype);
        formData.append('messaging_product', 'whatsapp');
        try {
            this.logger.log(`Uploading media to Meta for org ${orgId} via account ${accountId}...`);
            const response = await axios_1.default.post(url, formData, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to upload media via account ${accountId}`);
        }
    }
    async sendMediaMessage(orgId, accountId, to, type, mediaId, caption) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;
        const mediaTypeKey = type.toLowerCase();
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: mediaTypeKey,
            [mediaTypeKey]: {
                id: mediaId,
            },
        };
        if (caption && (type === client_1.MessageType.IMAGE || type === client_1.MessageType.VIDEO)) {
            payload[mediaTypeKey].caption = caption;
        }
        try {
            this.logger.log(`Sending WhatsApp ${type} message for org ${orgId} to ${to}`);
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to send ${type} message via account ${accountId}`);
        }
    }
    async sendMediaByUrl(orgId, accountId, to, mediaType, mediaUrl, caption, filename) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;
        const mediaObj = { link: mediaUrl };
        if (caption && (mediaType === 'image' || mediaType === 'video')) {
            mediaObj.caption = caption;
        }
        if (filename && mediaType === 'document') {
            mediaObj.filename = filename;
        }
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: mediaType,
            [mediaType]: mediaObj,
        };
        try {
            this.logger.log(`Sending WhatsApp ${mediaType} (URL) for org ${orgId} to ${to}`);
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to send ${mediaType} URL message via account ${accountId}`);
        }
    }
    async sendInteractiveButtons(orgId, accountId, to, bodyText, buttons, headerText, footerText) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;
        const payload = {
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
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to send interactive buttons via account ${accountId}`);
        }
    }
    async sendInteractiveList(orgId, accountId, to, bodyText, buttonText, sections, headerText, footerText) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.phoneNumberId}/messages`;
        const payload = {
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
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to send interactive list via account ${accountId}`);
        }
    }
    async listAccounts(orgId, user) {
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
    async getTemplates(orgId, accountId, forceSync = false) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        if (!forceSync) {
            this.logger.log(`[Templates] Fetching cached templates for account ${accountId} (Local DB)`);
            return this.prisma.whatsAppTemplate.findMany({
                where: { accountId, organizationId: orgId, isActive: true },
                orderBy: { updatedAt: 'desc' }
            });
        }
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;
        try {
            this.logger.log(`[Templates] Forcing synchronization from Meta for account ${accountId}...`);
            const response = await axios_1.default.get(url, {
                params: { limit: 100 },
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                },
            });
            const metaTemplates = response.data.data || [];
            this.logger.log(`[Templates] Received ${metaTemplates.length} templates from Meta API.`);
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
            return this.prisma.whatsAppTemplate.findMany({
                where: { accountId, organizationId: orgId, isActive: true },
                orderBy: { updatedAt: 'desc' }
            });
        }
        catch (error) {
            this.handleError(error, `Failed to fetch and sync templates via account ${accountId}`);
        }
    }
    async createTemplate(orgId, accountId, data) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;
        const prepareComponents = (components) => {
            return components.map((comp) => {
                const processed = { ...comp };
                Object.keys(processed).forEach(key => {
                    if (key.startsWith('_'))
                        delete processed[key];
                });
                if (processed.type === 'BODY' && processed.text) {
                    const variableRegex = /\{\{(\d+)\}\}/g;
                    const detectedIndices = [];
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
                if (processed.type === 'HEADER' && (processed.format === 'IMAGE' || processed.format === 'VIDEO')) {
                    if (processed.example?.header_handle) {
                        processed.example = processed.example;
                    }
                }
                if (processed.type === 'CAROUSEL' && processed.cards) {
                    processed.cards = processed.cards.map((card) => {
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
            const response = await axios_1.default.post(url, metaPayload, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
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
        }
        catch (error) {
            this.handleError(error, `Failed to create template via account ${accountId}`);
        }
    }
    async updateTemplate(orgId, accountId, templateId, data) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${templateId}`;
        try {
            this.logger.log(`Updating WhatsApp template ${templateId} for org ${orgId}`);
            const response = await axios_1.default.post(url, data, {
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to update template ${templateId}`);
        }
    }
    async deleteTemplate(orgId, accountId, templateName) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;
        try {
            this.logger.log(`Deleting WhatsApp template ${templateName} for org ${orgId}`);
            const response = await axios_1.default.delete(url, {
                params: { name: templateName },
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to delete template ${templateName}`);
        }
    }
    async syncAccount(orgId, accountId) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account) {
            throw new common_1.HttpException('WhatsApp Account not found or access denied.', common_1.HttpStatus.NOT_FOUND);
        }
        if (!account.wabaId || !account.phoneNumberId) {
            throw new common_1.HttpException('Incomplete account data (missing WABA or Phone ID). Try reconnecting.', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            this.logger.log(`[SYNC] Starting sync for account ${accountId} (WABA: ${account.wabaId})`);
            const { token: validatedToken } = await this.getValidToken(account);
            const phoneRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/phone_numbers`, {
                params: { fields: 'display_phone_number,quality_rating,messaging_limit_tier,verified_name,code_verification_status,name_status' },
                headers: { Authorization: `Bearer ${validatedToken}` },
            });
            const phoneData = phoneRes.data?.data || [];
            const phoneInfo = phoneData.find((p) => p.id === account.phoneNumberId);
            if (!phoneInfo) {
                this.logger.error(`[SYNC FAILURE] Phone number ${account.phoneNumberId} missing in WABA ${account.wabaId}. Avail IDs: ${phoneData.map((p) => p.id).join(', ')}`);
                throw new common_1.HttpException('Your Phone Number ID is no longer associated with this Meta WABA.', common_1.HttpStatus.UNAUTHORIZED);
            }
            const tierMapping = {
                'TIER_1000': 1000,
                'TIER_10000': 10000,
                'TIER_100000': 100000,
                'TIER_UNLIMITED': 1000000
            };
            const tier = phoneInfo.messaging_limit_tier || 'TIER_1000';
            const count = tierMapping[tier] || 1000;
            let businessProfile = {};
            try {
                businessProfile = {
                    ...(typeof account.businessProfile === 'object' ? account.businessProfile : {}),
                    qualityRating: (phoneInfo.quality_rating || 'UNKNOWN').toUpperCase(),
                    nameStatus: phoneInfo.name_status || 'UNKNOWN',
                    lastSyncAt: new Date().toISOString(),
                };
            }
            catch (profileErr) {
                this.logger.error(`[SYNC] Failed to merge business profile JSON for account ${accountId}: ${profileErr.message}`);
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
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            this.handleError(error, `Synchronization failed`);
        }
    }
    async disconnectAccount(orgId, accountId) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account) {
            throw new common_1.ConflictException('WhatsApp account not found or access denied');
        }
        return this.prisma.whatsAppAccount.delete({
            where: { id: accountId },
        });
    }
    async getValidToken(account) {
        const storedToken = this.securityService.decrypt(account.accessToken);
        const globalToken = this.configService.get('whatsapp.accessToken');
        try {
            await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
                params: { input_token: storedToken },
                headers: { Authorization: `Bearer ${storedToken}` },
            });
            return { token: storedToken, wasUpdated: false };
        }
        catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            this.logger.warn(`Token validation failed for ${account.id}: ${errorMsg}`);
            if (globalToken && globalToken !== storedToken) {
                this.logger.log(`Attempting global token fallback for account ${account.id}...`);
                try {
                    await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
                        params: { input_token: globalToken },
                        headers: { Authorization: `Bearer ${globalToken}` },
                    });
                    await this.prisma.whatsAppAccount.update({
                        where: { id: account.id },
                        data: { accessToken: this.securityService.encrypt(globalToken) },
                    });
                    return { token: globalToken, wasUpdated: true };
                }
                catch (globalErr) {
                    this.logger.error(`CRITICAL: Global system token is also invalid.`);
                    throw error;
                }
            }
            throw new common_1.HttpException(`WhatsApp authentication failed: ${errorMsg}. Your token may have expired.`, common_1.HttpStatus.UNAUTHORIZED);
        }
    }
    handleError(error, context) {
        const errorData = error.response?.data;
        const errorMsg = errorData?.error?.message || errorData?.message || error.message;
        const errorCode = errorData?.error?.code || errorData?.code;
        const errorSubcode = errorData?.error?.error_subcode;
        this.logger.error(`${context}: ${errorMsg} (Code: ${errorCode}, Subcode: ${errorSubcode})`);
        if (errorData && !errorData.error) {
            this.logger.error(`${context} Full Response: ${JSON.stringify(errorData)}`);
        }
        if (error.response?.status === common_1.HttpStatus.UNAUTHORIZED) {
            throw new common_1.HttpException(`${context}: Authentication failed. Please reconnect your WhatsApp account.`, common_1.HttpStatus.UNAUTHORIZED);
        }
        throw new common_1.HttpException(`${context}: ${errorMsg || 'Unknown WhatsApp API error'}`, error.response?.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
};
exports.WhatsappService = WhatsappService;
exports.WhatsappService = WhatsappService = WhatsappService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        security_service_1.SecurityService])
], WhatsappService);
//# sourceMappingURL=whatsapp.service.js.map