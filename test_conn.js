const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  const org = await prisma.organization.findFirst();
  const conn = await prisma.metaCommerceConnection.findFirst({ where: { organizationId: org.id } });
  console.log(conn);
}
test();
