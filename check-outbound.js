const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.message.count({
    where: { direction: 'OUTBOUND', type: 'TEMPLATE' }
  });
  console.log('Outbound templates:', count);

  const sample = await prisma.message.findFirst({
    where: { direction: 'OUTBOUND', type: 'TEMPLATE' },
    include: { contact: true }
  });
  console.log(JSON.stringify(sample, null, 2));
}

main().finally(() => {
  prisma.$disconnect();
});
