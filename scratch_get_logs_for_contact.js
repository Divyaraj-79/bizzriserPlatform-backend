const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contactId = '40bb956f-7b25-43e9-9d3a-285f9e55011f';
  const logs = await prisma.campaignLog.findMany({
    where: { message: { contains: contactId } },
    orderBy: { createdAt: 'desc' }
  });

  console.log('--- LOGS FOR CONTACT ---');
  logs.forEach(l => console.log(l.message));

  process.exit(0);
}

main().catch(console.error);
