
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Rename the existing BizzRiser Internal to BizzRiser Main so it's normal
  await prisma.organization.updateMany({
    where: { name: 'BizzRiser Internal' },
    data: { name: 'BizzRiser Main' }
  });
  console.log('Renamed old org to BizzRiser Main');

  // 2. Create dedicated Superadmin Org
  const superAdminOrg = await prisma.organization.create({
    data: {
      name: 'Superadmin Private',
      slug: 'superadmin-private',
      subscriptionStatus: 'ACTIVE',
      credits: -1
    }
  });

  // 3. Move the superadmin user to this new org
  await prisma.user.updateMany({
    where: { email: 'superadmin@bizzriser.com' },
    data: { organizationId: superAdminOrg.id }
  });
  
  console.log('Moved superadmin to Superadmin Private');
}

main().catch(console.error).finally(() => prisma.$disconnect());

