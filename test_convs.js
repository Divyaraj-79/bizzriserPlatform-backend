const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const convs = await prisma.conversation.findMany({ take: 5, select: { id: true, section: true }});
  console.log(convs);
}
main().finally(() => prisma.$disconnect());
