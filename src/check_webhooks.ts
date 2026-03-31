import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const lastEvents = await prisma.webhookEvent.findMany({
    take: 10,
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log('Last 10 Webhook Events:', JSON.stringify(lastEvents, null, 2));

  const count = await prisma.webhookEvent.count();
  console.log(`Total Webhook Events: ${count}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
