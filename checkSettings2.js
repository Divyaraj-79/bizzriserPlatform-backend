const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const catalogs = await prisma.metaCatalog.findMany();
  for (const c of catalogs) {
    console.log(c.id, c.organizationId, c.metaCatalogId);
  }
}
main().finally(() => prisma.$disconnect());
