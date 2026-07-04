const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2
  });
  console.log(JSON.stringify(events, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
