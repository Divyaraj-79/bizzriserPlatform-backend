const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orgCount = await prisma.organization.count();
  const contactStats = await prisma.$queryRaw`SELECT "organizationId", COUNT(*) as count FROM contacts GROUP BY "organizationId"`;
  const userStats = await prisma.user.findMany({ select: { email: true, organizationId: true, role: true } });

  console.log('--- SYSTEM DATA DISTRIBUTION ---');
  console.log('Total Organizations:', orgCount);
  console.log('Contact Distribution:', JSON.stringify(contactStats, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2));
  console.log('User Roles & Orgs:', JSON.stringify(userStats, null, 2));
  
  const bizzRiserOrg = await prisma.organization.findFirst({ where: { name: { contains: 'BizzRiser', mode: 'insensitive' } } });
  console.log('BizzRiser Org ID Match:', bizzRiserOrg?.id);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
