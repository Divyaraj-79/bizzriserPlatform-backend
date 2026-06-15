const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const msgs = await prisma.message.findMany({
    where: { contactId: '015e0517-69da-48b1-96b9-602921779b84' }
  });
  console.log(JSON.stringify(msgs, null, 2));
}

main().finally(() => {
  prisma.$disconnect();
});
