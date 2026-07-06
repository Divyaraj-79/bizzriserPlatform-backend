const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true }
  });
  console.log(orgs);
}

run().catch(console.error).finally(() => prisma.$disconnect());
