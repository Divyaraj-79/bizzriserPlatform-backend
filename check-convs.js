const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const convs = await prisma.conversation.findMany({
    where: { section: 'PRIMARY' },
    orderBy: { lastMessageAt: 'desc' },
    take: 5,
    include: { messages: { orderBy: { createdAt: 'asc' } }, contact: true }
  });
  console.log(JSON.stringify(convs.map(c => ({ id: c.id, name: c.contact?.firstName, messages: c.messages })), null, 2));
}

main().finally(() => {
  prisma.$disconnect();
});
