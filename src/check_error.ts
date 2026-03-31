import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const lastFailedMessage = await prisma.message.findFirst({
    where: {
      status: 'FAILED',
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      failureReason: true,
      content: true,
      createdAt: true,
    },
  });

  if (lastFailedMessage) {
    console.log('Last Failed Message:', JSON.stringify(lastFailedMessage, null, 2));
  } else {
    console.log('No failed messages found.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
