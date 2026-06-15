const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { MessagingService } = require('./dist/modules/messaging/messaging.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const messagingService = app.get(MessagingService);
  try {
    const orgId = '2d672d52-30df-484b-bd07-650ba09f22a6';
    const result = await messagingService.getConversations(orgId, undefined, 'PRIMARY', 1, 20);
    console.log('Total:', result.total);
    console.log('Conversations count:', result.data.length);
  } catch (error) {
    console.error('ERROR:', error);
  }
  await app.close();
}
bootstrap();
