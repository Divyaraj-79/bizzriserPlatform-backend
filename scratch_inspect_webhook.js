const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const event = await prisma.webhookEvent.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (event) {
    console.log('--- RAW WEBHOOK EVENT ---');
    console.log('Type:', event.eventType);
    console.log('Payload:', JSON.stringify(event.payload, null, 2));
  } else {
    console.log('No webhook events found.');
  }

  process.exit(0);
}

main().catch(console.error);
