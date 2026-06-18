const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.chatbotSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      chatbot: { select: { id: true, name: true } },
      contact: { select: { phone: true, firstName: true } }
    }
  });

  console.log('Recent sessions:', JSON.stringify(sessions, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
