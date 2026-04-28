import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter, TransformInterceptor, LoggingInterceptor } from './common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  
  // CRITICAL: Increase body size limits for massive bulk imports (1 Lakh+ records)
  // Must be applied before pipes and other middlewares.
  // We MUST attach the raw buffer (buf) to req.rawBody so WhatsApp Webhook signature validation doesn't crash!
  app.use(json({ 
    limit: '50mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3001;

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global interceptors and filters
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    // Removed forbidNonWhitelisted — it was causing 400 errors on analytics endpoints
    // because query params weren't exactly matching DTOs during initial load.
    // whitelist:true already strips unknown params silently.
    forbidNonWhitelisted: false,
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS
  app.enableCors({
    origin: '*', // In production, replace with proper origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://localhost:${port}/api/v1`);
}

bootstrap();
