const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const catalogs = await prisma.metaCatalog.findMany();
  for (const c of catalogs) {
    console.log(c.organizationId);
    console.log(JSON.stringify(c.settings, null, 2));
  }
}
main().finally(() => prisma.$disconnect());
