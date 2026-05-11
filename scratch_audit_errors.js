const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { status: 'FAILED' },
    orderBy: { failedAt: 'desc' },
    include: { contact: true }
  });

  if (recipient) {
    console.log('--- RECIPIENT ---');
    console.log('Phone:', recipient.contact.phone);
    console.log('Status:', recipient.status);
    console.log('Failed At:', recipient.failedAt);
    console.log('Failure Reason:', recipient.failureReason);
  } else {
    console.log('No failed recipients found.');
  }

  const message = await prisma.message.findFirst({
    where: { status: 'FAILED' },
    orderBy: { failedAt: 'desc' }
  });

  if (message) {
    console.log('\n--- MESSAGE ---');
    console.log('WA ID:', message.waMessageId);
    console.log('Failure Reason:', message.failureReason);
    console.log('Content:', JSON.stringify(message.content));
  }

  process.exit(0);
}

main().catch(console.error);
