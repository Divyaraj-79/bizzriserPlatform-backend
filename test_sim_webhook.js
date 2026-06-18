const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('./dist/app.module.js');
  const { WebhookProcessor } = require('./dist/modules/webhook/webhook.processor.js');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const processor = app.get(WebhookProcessor);

  const contact = await prisma.contact.findUnique({
    where: { id: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b' }
  });

  const job = {
    data: {
      eventId: 'test-event-123',
      accountId: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7',
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      data: {
        messages: [{
          id: 'wamid.test',
          from: contact.phone,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'text',
          text: { body: 'start' }
        }],
        contacts: [{ wa_id: contact.phone, profile: { name: 'Test' } }]
      }
    }
  };

  console.log('--- EXECUTING WEBHOOK ---');
  try {
    await processor.handleProcessMessage(job);
  } catch (err) {
    console.error('Webhook error:', err);
  }
  
  console.log('--- CHECKING DB ---');
  const messages = await prisma.message.findMany({
    where: { direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  console.log('Latest outbound:', messages);

  await app.close();
}

main().catch(console.error).finally(() => prisma.$disconnect());
