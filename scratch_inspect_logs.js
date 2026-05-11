const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const log = await prisma.campaignLog.findFirst({
    where: { level: 'ERROR' },
    orderBy: { createdAt: 'desc' }
  });

  if (log) {
    console.log('--- CAMPAIGN ERROR LOG ---');
    console.log('Message:', log.message);
  } else {
    console.log('No error logs found.');
  }

  process.exit(0);
}

main().catch(console.error);
