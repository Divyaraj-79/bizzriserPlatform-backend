"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsConfig = exports.encryptionConfig = exports.whatsappConfig = exports.jwtConfig = exports.redisConfig = exports.databaseConfig = exports.appConfig = void 0;
const config_1 = require("@nestjs/config");
exports.appConfig = (0, config_1.registerAs)('app', () => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
}));
exports.databaseConfig = (0, config_1.registerAs)('database', () => ({
    url: process.env.DATABASE_URL,
}));
exports.redisConfig = (0, config_1.registerAs)('redis', () => ({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
}));
exports.jwtConfig = (0, config_1.registerAs)('jwt', () => ({
    secret: process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
exports.whatsappConfig = (0, config_1.registerAs)('whatsapp', () => ({
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v20.0',
    graphBaseUrl: process.env.WHATSAPP_GRAPH_BASE_URL ?? 'https://graph.facebook.com',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    appId: process.env.WHATSAPP_APP_ID,
}));
exports.encryptionConfig = (0, config_1.registerAs)('encryption', () => ({
    key: process.env.ENCRYPTION_KEY,
}));
exports.corsConfig = (0, config_1.registerAs)('cors', () => ({
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
}));
//# sourceMappingURL=configuration.js.map