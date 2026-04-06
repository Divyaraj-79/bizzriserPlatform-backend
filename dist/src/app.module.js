"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const prisma_module_1 = require("./prisma/prisma.module");
const config_2 = require("./config");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const organizations_module_1 = require("./modules/organizations/organizations.module");
const whatsapp_module_1 = require("./modules/whatsapp/whatsapp.module");
const webhook_module_1 = require("./modules/webhook/webhook.module");
const messaging_module_1 = require("./modules/messaging/messaging.module");
const contacts_module_1 = require("./modules/contacts/contacts.module");
const campaigns_module_1 = require("./modules/campaigns/campaigns.module");
const realtime_module_1 = require("./modules/realtime/realtime.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
                load: [config_2.appConfig, config_2.databaseConfig, config_2.redisConfig, config_2.jwtConfig, config_2.whatsappConfig, config_2.encryptionConfig, config_2.corsConfig],
                validationSchema: config_2.validationSchema,
                validationOptions: {
                    allowUnknown: true,
                    abortEarly: true,
                },
            }),
            prisma_module_1.PrismaModule,
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (config) => {
                    const rawHost = config.get('redis.host') || 'localhost';
                    const port = config.get('redis.port') || 6379;
                    const password = config.get('redis.password');
                    const isUrl = rawHost.startsWith('redis://') || rawHost.startsWith('rediss://');
                    const isCloud = isUrl || rawHost.includes('render.com') || rawHost.includes('internal');
                    if (isUrl) {
                        return {
                            url: rawHost,
                            redis: {
                                maxRetriesPerRequest: null,
                                tls: rawHost.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
                                retryStrategy: (times) => Math.min(times * 100, 5000),
                            }
                        };
                    }
                    return {
                        redis: {
                            host: rawHost,
                            port,
                            password,
                            maxRetriesPerRequest: null,
                            tls: isCloud ? { rejectUnauthorized: false } : undefined,
                            retryStrategy: (times) => Math.min(times * 100, 5000),
                        },
                    };
                },
                inject: [config_1.ConfigService],
            }),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            organizations_module_1.OrganizationsModule,
            whatsapp_module_1.WhatsappModule,
            webhook_module_1.WebhookModule,
            messaging_module_1.MessagingModule,
            contacts_module_1.ContactsModule,
            campaigns_module_1.CampaignsModule,
            realtime_module_1.RealtimeModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map