const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('Last 10 messages from ALL contacts:', JSON.stringify(messages, null, 2));

  const sessions = await prisma.chatbotSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Recent sessions:', JSON.stringify(sessions, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
