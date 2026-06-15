const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const conv = await prisma.conversation.findFirst({
    where: { section: 'PRIMARY' },
    orderBy: { lastMessageAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } }, contact: true }
  });
  console.log(JSON.stringify(conv, null, 2));
}

main().finally(() => {
  prisma.$disconnect();
});
