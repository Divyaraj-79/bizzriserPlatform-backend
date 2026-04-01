"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WebhookService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const bullmq_1 = require("bullmq");
const crypto = __importStar(require("crypto"));
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let WebhookService = WebhookService_1 = class WebhookService {
    config;
    prisma;
    webhookQueue;
    logger = new common_1.Logger(WebhookService_1.name);
    constructor(config, prisma, webhookQueue) {
        this.config = config;
        this.prisma = prisma;
        this.webhookQueue = webhookQueue;
    }
    verifyWebhook(mode, token, challenge) {
        const verifyToken = this.config.get('whatsapp.verifyToken');
        if (mode === 'subscribe' && token === verifyToken) {
            this.logger.log(`Webhook verified successfully. Returning challenge: ${challenge}`);
            return challenge;
        }
        this.logger.error('Webhook verification failed: Invalid verify token');
        throw new common_1.UnauthorizedException('Invalid verification token');
    }
    async handleIncomingWebhook(signature, payload, rawBody) {
        this.validateSignature(signature, payload, rawBody);
        const entries = payload.entry || [];
        for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
                if (change.field === 'messages') {
                    await this.processMessageEvent(entry.id, change.value);
                }
                if (change.field === 'account_update' && change.value?.event === 'PARTNER_APP_INSTALLED') {
                    const wabaId = change.value?.waba_info?.waba_id;
                    if (wabaId) {
                        this.logger.log(`Detected WABA installation via webhook: ${wabaId}`);
                        const firstOrg = await this.prisma.organization.findFirst();
                        if (firstOrg) {
                            await this.prisma.webhookEvent.create({
                                data: {
                                    organizationId: firstOrg.id,
                                    eventType: client_1.WebhookEventType.MESSAGE_RECEIVED,
                                    payload: {
                                        ...change.value,
                                        isSignupEvent: true,
                                    },
                                }
                            });
                        }
                    }
                }
            }
        }
        return { status: 'received' };
    }
    validateSignature(signature, payload, rawBody) {
        if (!signature) {
            this.logger.error('Missing X-Hub-Signature-256 header');
            throw new common_1.UnauthorizedException('Missing signature');
        }
        const appSecret = this.config.get('whatsapp.appSecret');
        if (!appSecret) {
            throw new Error('WHATSAPP_APP_SECRET is not configured');
        }
        if (!rawBody) {
            this.logger.error('Missing rawBody for signature validation. Check NestJS bootstrap config.');
            throw new Error('Internal validation error');
        }
        const expectedSignature = crypto
            .createHmac('sha256', appSecret)
            .update(rawBody)
            .digest('hex');
        const incomingHash = signature.split('=')[1];
        if (incomingHash !== expectedSignature) {
            this.logger.error(`Signature mismatch! Incoming: ${incomingHash}, Expected: ${expectedSignature}`);
            throw new common_1.UnauthorizedException('Invalid signature');
        }
        this.logger.debug('Webhook signature verified successfully');
    }
    async processMessageEvent(wabaId, value) {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId)
            return;
        const account = await this.prisma.whatsAppAccount.findUnique({
            where: { phoneNumberId },
            select: { id: true, organizationId: true },
        });
        if (!account) {
            this.logger.warn(`No account found for phone_number_id: ${phoneNumberId}`);
            return;
        }
        const event = await this.prisma.webhookEvent.create({
            data: {
                organizationId: account.organizationId,
                eventType: client_1.WebhookEventType.MESSAGE_RECEIVED,
                payload: value,
            },
        });
        await this.webhookQueue.add('process-message', {
            eventId: event.id,
            accountId: account.id,
            organizationId: account.organizationId,
            data: value,
        });
    }
};
exports.WebhookService = WebhookService;
exports.WebhookService = WebhookService = WebhookService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)('webhooks')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        bullmq_1.Queue])
], WebhookService);
//# sourceMappingURL=webhook.service.js.map