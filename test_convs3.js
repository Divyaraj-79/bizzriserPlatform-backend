const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const c1 = await prisma.conversation.count({ where: { section: 'PRIMARY' } });
  const c2 = await prisma.conversation.count();
  console.log('PRIMARY:', c1, 'TOTAL:', c2);
}
main().finally(() => { prisma.$disconnect() });
