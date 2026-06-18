const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    where: {
      direction: 'OUTBOUND'
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log('Recent outbound messages:', JSON.stringify(messages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
