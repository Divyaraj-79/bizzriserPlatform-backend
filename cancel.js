const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.campaign.updateMany({
    where: { status: { in: ['RUNNING', 'SCHEDULED'] } },
    data: { status: 'CANCELLED' }
  });
  console.log('Cancelled campaigns:', result.count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
