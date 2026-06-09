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
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
const common_2 = require("./common");
const express_1 = require("express");
const express = __importStar(require("express"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    app.use((0, express_1.json)({
        limit: '150mb',
        verify: (req, res, buf) => {
            req.rawBody = buf;
        }
    }));
    app.use((0, express_1.urlencoded)({ limit: '150mb', extended: true }));
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        logger.log(`Created uploads directory: ${uploadsDir}`);
    }
    app.use('/uploads', express.static(uploadsDir));
    logger.log(`Serving static uploads from: ${uploadsDir} at /uploads`);
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('app.port') ?? 3001;
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new common_2.TransformInterceptor());
    app.useGlobalInterceptors(new common_2.LoggingInterceptor());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
    }));
    app.useGlobalFilters(new common_2.GlobalExceptionFilter());
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });
    await app.listen(port, '0.0.0.0');
    logger.log(`Application is running on: http://localhost:${port}/api/v1`);
}
bootstrap();
//# sourceMappingURL=main.js.map