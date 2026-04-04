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
        const rawHost = config.get<string>('redis.host') || 'localhost';
        const port = config.get<number>('redis.port') || 6379;
        const password = config.get<string>('redis.password');
        
        // Handle if REDIS_HOST is actually a URL
        const isUrl = rawHost.startsWith('redis://') || rawHost.startsWith('rediss://');
        const isCloud = isUrl || rawHost.includes('render.com') || rawHost.includes('internal');

        if (isUrl) {
          return {
            url: rawHost,
            redis: {
              maxRetriesPerRequest: null,
              tls: rawHost.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
              retryStrategy: (times: number) => Math.min(times * 100, 5000),
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
            retryStrategy: (times: number) => Math.min(times * 100, 5000),
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
