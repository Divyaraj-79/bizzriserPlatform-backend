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
        this.apiVersion = this.configService.get('whatsapp.apiVersion') ?? 'v20.0';
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
        const { code, accessToken: providedToken } = data;
        const appId = this.configService.get('whatsapp.appId');
        const appSecret = this.configService.get('whatsapp.appSecret');
        if (!appId || !appSecret || appSecret.includes('your_facebook_app_secret')) {
            throw new common_1.HttpException('Meta App ID or Secret is not configured in the backend environment.', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        let accessToken = providedToken;
        if (code) {
            this.logger.log(`Attempting token exchange with code: ${code.substring(0, 10)}...`);
            try {
                const tokenRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/oauth/access_token`, {
                    params: {
                        client_id: appId,
                        client_secret: appSecret,
                        code,
                    },
                });
                accessToken = tokenRes.data.access_token;
                this.logger.log('Token exchange successful');
            }
            catch (tokenErr) {
                this.logger.error(`Token exchange failed: ${tokenErr.response?.data?.error?.message || tokenErr.message}`);
                throw new common_1.HttpException(`Meta Token Exchange Failed: ${tokenErr.response?.data?.error?.message || tokenErr.message}`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (!accessToken) {
            throw new common_1.HttpException('Missing authorization code or access token from Meta signup.', common_1.HttpStatus.BAD_REQUEST);
        }
        this.logger.log('Discovering WABA IDs...');
        let wabaId;
        try {
            const debugRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
                params: {
                    input_token: accessToken,
                    access_token: `${appId}|${appSecret}`,
                },
            });
            wabaId = debugRes.data.data.granular_scopes?.find((s) => s.scope === 'whatsapp_business_management')?.target_ids?.[0];
            this.logger.log(`Found WABA ID: ${wabaId}`);
        }
        catch (debugErr) {
            this.logger.error(`WABA Discovery failed: ${debugErr.response?.data?.error?.message || debugErr.message}`);
            throw new common_1.HttpException('Failed to discover WhatsApp Business Account assets.', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!wabaId) {
            throw new common_1.HttpException('Could not find a WhatsApp Business Account associated with this token. Please ensure you have completed the Meta signup flow.', common_1.HttpStatus.BAD_REQUEST);
        }
        const phoneRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/${wabaId}/phone_numbers`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const phoneData = phoneRes.data.data?.[0];
        if (!phoneData) {
            throw new common_1.HttpException('No phone numbers found in the connected WABA.', common_1.HttpStatus.BAD_REQUEST);
        }
        const { id: phoneNumberId, display_phone_number: phoneNumber, verified_name: displayName } = phoneData;
        const encryptedToken = this.securityService.encrypt(accessToken);
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
        const adminAccount = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!adminAccount) {
            throw new common_1.ConflictException('WhatsApp account not found or access denied');
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
        const adminAccount = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!adminAccount) {
            throw new common_1.ConflictException('WhatsApp account not found or access denied');
        }
        const { token: validatedToken } = await this.getValidToken(adminAccount);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${adminAccount.phoneNumberId}/messages`;
        const payload = {
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
    async listAccounts(orgId) {
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
    async getTemplates(orgId, accountId) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        const { token: validatedToken } = await this.getValidToken(account);
        const url = `${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/message_templates`;
        try {
            this.logger.log(`Fetching WhatsApp templates for org ${orgId} via account ${accountId} (WABA: ${account.wabaId})`);
            const response = await axios_1.default.get(url, {
                params: { limit: 100 },
                headers: {
                    Authorization: `Bearer ${validatedToken}`,
                },
            });
            return response.data;
        }
        catch (error) {
            this.handleError(error, `Failed to fetch templates via account ${accountId}`);
        }
    }
    async syncAccount(orgId, accountId) {
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId, organizationId: orgId },
        });
        if (!account)
            throw new common_1.ConflictException('Account not found');
        try {
            const { token: validatedToken } = await this.getValidToken(account);
            const phoneRes = await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/${account.wabaId}/phone_numbers`, {
                params: { fields: 'display_phone_number,quality_rating,messaging_limit_tier,verified_name,code_verification_status,name_status' },
                headers: { Authorization: `Bearer ${validatedToken}` },
            });
            const phoneData = phoneRes.data?.data || [];
            const phoneInfo = phoneData.find((p) => p.id === account.phoneNumberId);
            if (!phoneInfo) {
                this.logger.error(`Phone number ${account.phoneNumberId} not found in WABA ${account.wabaId}. Available IDs: ${phoneData.map((p) => p.id).join(', ')}`);
                throw new Error('Phone number no longer associated with this WABA');
            }
            const updatedAccount = await this.prisma.whatsAppAccount.update({
                where: { id: accountId },
                data: {
                    displayName: phoneInfo.verified_name || account.displayName,
                    status: phoneInfo.code_verification_status === 'VERIFIED' ? 'ACTIVE' : 'INACTIVE',
                    businessProfile: {
                        ...(typeof account.businessProfile === 'object' ? account.businessProfile : {}),
                        qualityRating: (phoneInfo.quality_rating || 'UNKNOWN').toUpperCase(),
                        messagingLimit: phoneInfo.messaging_limit_tier || 'UNKNOWN',
                        nameStatus: phoneInfo.name_status || 'UNKNOWN',
                        lastSyncAt: new Date().toISOString(),
                    },
                },
            });
            return updatedAccount;
        }
        catch (error) {
            this.handleError(error, `Sync failed for account ${accountId}`);
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
            if (error.response?.status === 401 && globalToken && globalToken !== storedToken) {
                this.logger.warn(`Stored token for account ${account.id} failed (401). Trying global token...`);
                try {
                    await axios_1.default.get(`${this.graphBaseUrl}/${this.apiVersion}/debug_token`, {
                        params: { input_token: globalToken },
                        headers: { Authorization: `Bearer ${globalToken}` },
                    });
                    this.logger.log(`Global token validated! Updating database for account ${account.id}...`);
                    await this.prisma.whatsAppAccount.update({
                        where: { id: account.id },
                        data: { accessToken: this.securityService.encrypt(globalToken) },
                    });
                    return { token: globalToken, wasUpdated: true };
                }
                catch (globalErr) {
                    this.logger.error(`Global token also failed verification.`);
                    throw error;
                }
            }
            throw error;
        }
    }
    handleError(error, contextMessage) {
        const status = error.response?.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const errorData = error.response?.data?.error || error.response?.data || { message: 'Unknown WhatsApp API error' };
        const metaMessage = errorData.message || 'WhatsApp API Error';
        const enhancedMessage = `${contextMessage}: ${metaMessage}`;
        this.logger.error(`${contextMessage}:`, JSON.stringify(errorData));
        throw new common_1.HttpException({
            success: false,
            message: enhancedMessage,
            details: errorData,
        }, status);
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