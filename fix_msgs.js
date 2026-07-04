const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.message.updateMany({
    where: { type: 'TEXT', content: { equals: {} } },
    data: { content: { body: '[Unsupported Message: Message type unknown]' } }
  });
  console.log('Fixed old messages');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
