const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    where: { contactId: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('Recent messages:', JSON.stringify(messages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
