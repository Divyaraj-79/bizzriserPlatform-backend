import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { WebhookProcessor } from './src/modules/webhook/webhook.processor';

import { PrismaService } from './src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const webhookProcessor = app.get(WebhookProcessor);
  
  // Need to figure out the active chatbot in DB and its orgId/accountId.
  const prisma = app.get(PrismaService);
  const activeBots = await prisma.chatbot.findMany({ where: { status: 'ACTIVE' } });
  
  if (activeBots.length === 0) {
    console.log('No active chatbots found in DB. Please enable one first.');
    await app.close();
    return;
  }
  
  const bot = activeBots[0];
  console.log(`Testing with Chatbot: ${bot.id} - ${bot.name}`);
  
  // Find a valid WhatsAppAccount
  const whatsappAccount = await prisma.whatsAppAccount.findFirst({ where: { organizationId: bot.organizationId } });
  const realAccountId = whatsappAccount ? whatsappAccount.id : (bot as any).accountId;
  
  // Find a test contact or create one
  const testContact = await prisma.contact.findFirst({ where: { organizationId: bot.organizationId }});
  const fromPhone = testContact ? testContact.phone : '1234567890';
  
  const jobMock = {
    data: {
      eventId: 'test-event-1',
      accountId: realAccountId,
      organizationId: bot.organizationId,
      data: {
        contacts: [{ profile: { name: 'Test User' }, wa_id: fromPhone }],
        messages: [{
          id: `wamid.test.${Date.now()}`,
          from: fromPhone,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'text',
          text: { body: 'Hello' }
        }]
      }
    }
  };
  
  console.log('Triggering handleIncomingMessage...');
  try {
    const contactData = jobMock.data.data.contacts[0];
    const messageData = jobMock.data.data.messages[0];
    await (webhookProcessor as any).handleIncomingMessage(
      jobMock.data.accountId, 
      jobMock.data.organizationId, 
      contactData, 
      messageData
    );
    console.log('Successfully processed message!');
  } catch (err) {
    console.error('Error processing message:', err);
  }
  
  await app.close();
}

bootstrap();
