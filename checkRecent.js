const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orgId = '17d2b493-87b0-4671-aa19-2ca72e64eb38';
  
  // Try getSettings behavior
  const catalog = await prisma.metaCatalog.findFirst({
    where: { organizationId: orgId },
    orderBy: { updatedAt: 'desc' }
  });
  console.log('Most recent catalog:');
  console.log(catalog.id, catalog.updatedAt);
  console.log(JSON.stringify(catalog.settings, null, 2));
}

main().finally(() => prisma.$disconnect());
