const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const msg = await prisma.message.findFirst({
    where: { type: 'TEMPLATE' },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(msg.content, null, 2));
}
check().finally(() => prisma.$disconnect());
