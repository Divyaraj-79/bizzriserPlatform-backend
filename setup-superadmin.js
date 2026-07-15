
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // 1. Downgrade old superadmin
  await prisma.user.updateMany({
    where: { email: 'divyarajmakwana79@gmail.com' },
    data: { role: 'ORG_ADMIN' }
  });
  console.log('Old superadmin downgraded to ORG_ADMIN.');

  // 2. Get BizzRiser Internal organization
  let internalOrg = await prisma.organization.findFirst({
    where: { name: 'BizzRiser Internal' }
  });

  if (!internalOrg) {
    console.log('BizzRiser Internal org not found. Re-creating it.');
    internalOrg = await prisma.organization.create({
      data: {
        name: 'BizzRiser Internal',
        slug: 'bizzriser-internal',
        subscriptionStatus: 'ACTIVE',
        credits: -1
      }
    });
  }

  // 3. Create or update superadmin@bizzriser.com
  const passwordHash = await bcrypt.hash('BizzBDPM@79#2026', 10);
  
  const superadmin = await prisma.user.upsert({
    where: { email: 'superadmin@bizzriser.com' },
    update: {
      passwordHash: passwordHash,
      role: 'SUPER_ADMIN',
      organizationId: internalOrg.id
    },
    create: {
      email: 'superadmin@bizzriser.com',
      passwordHash: passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      organizationId: internalOrg.id
    }
  });

  console.log('New Superadmin created successfully tied to Internal org:', superadmin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

