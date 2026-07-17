const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orgId = '17d2b493-87b0-4671-aa19-2ca72e64eb38';
  
  const catalog = await prisma.metaCatalog.findFirst({
    where: { organizationId: orgId },
    orderBy: { updatedAt: 'desc' }
  });
  
  const settings = (catalog?.settings) || {};
  console.log("Returned paymentSettings:");
  console.log(settings.paymentSettings || {});
}

main().finally(() => prisma.$disconnect());
