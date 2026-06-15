const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const conv = await prisma.conversation.findFirst({
    where: { contact: { firstName: { contains: 'Dhaval Gotecha' } } },
    include: { messages: { orderBy: { createdAt: 'asc' } }, contact: true }
  });
  console.log(JSON.stringify(conv, null, 2));

  // If not found, try by phone or lastMessageBody
  if (!conv) {
    const conv2 = await prisma.conversation.findFirst({
      where: { lastMessageBody: { contains: 'શ્રી જલારામ વેડીંગ કલેક્શન' } },
      include: { messages: { orderBy: { createdAt: 'asc' } }, contact: true }
    });
    console.log("Fallback search:");
    console.log(JSON.stringify(conv2, null, 2));
  }
}

main().finally(() => {
  prisma.$disconnect();
});
