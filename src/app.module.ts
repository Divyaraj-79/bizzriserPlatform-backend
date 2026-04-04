import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { validationSchema, appConfig, databaseConfig, redisConfig, jwtConfig, whatsappConfig, encryptionConfig, corsConfig } from './config';

// Domain Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    // Core Modules
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, redisConfig, jwtConfig, whatsappConfig, encryptionConfig, corsConfig],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    PrismaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => {
        const host = config.get<string>('redis.host') || 'localhost';
        const password = config.get<string>('redis.password');
        const port = config.get<number>('redis.port') || 6379;
        
        // Comprehensive cloud detection for TLS
        const isCloud = host.includes('render.com') || 
                        host.includes('redislabs.com') || 
                        host.includes('upstash.io') ||
                        host.includes('aws.com') ||
                        host.includes('internal'); // Render internal can sometimes use TLS
        
        return {
          redis: {
            host,
            port,
            password,
            maxRetriesPerRequest: null, // Allow BullMQ to handle retries internally
            enableReadyCheck: false,
            disconnectTimeout: 10000,
            connectTimeout: 20000,
            tls: isCloud ? { rejectUnauthorized: false } : undefined,
            retryStrategy: (times: number) => {
              // Stay connected forever - retry every 2-5 seconds
              return Math.min(times * 100, 5000);
            },
          },
        };
      },
      inject: [ConfigService],
    }),

    // Domain Modules
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WhatsappModule,
    WebhookModule,
    MessagingModule,
    ContactsModule,
    CampaignsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
