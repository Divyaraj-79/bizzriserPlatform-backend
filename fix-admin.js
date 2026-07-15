
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.updateMany({
    where: { email: 'divyarajmakwanabusiness@gmail.com' },
    data: { role: 'ORG_ADMIN' }
  });
  console.log('Downgraded divyarajmakwanabusiness@gmail.com to ORG_ADMIN');
}

main().catch(console.error).finally(() => prisma.$disconnect());

