import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const newSuperAdminHash = await bcrypt.hash('BizzRiser@79', 10);

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'bizzriser' },
    update: {},
    create: {
      name: 'BizzRiser Internal',
      slug: 'bizzriser',
    },
  });

  // 2. Create Super Admin (Founder)
  await prisma.user.upsert({
    where: { email: 'superadmin@bizzriser.com' },
    update: { role: UserRole.SUPER_ADMIN },
    create: {
      email: 'superadmin@bizzriser.com',
      passwordHash,
      firstName: 'BizzRiser',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      organizationId: org.id,
    },
  });

  // 2b. Create New Super Admin
  await prisma.user.upsert({
    where: { email: 'divyarajmakwanabusiness@gmail.com' },
    update: { 
      role: UserRole.SUPER_ADMIN,
      passwordHash: newSuperAdminHash
    },
    create: {
      email: 'divyarajmakwanabusiness@gmail.com',
      passwordHash: newSuperAdminHash,
      firstName: 'Divyaraj',
      lastName: 'Makwana',
      role: UserRole.SUPER_ADMIN,
      organizationId: org.id,
    },
  });

  // 3. Create a default Org Admin for the user to play with
  await prisma.user.upsert({
    where: { email: 'admin@bizzriser.com' },
    update: { role: UserRole.ORG_ADMIN },
    create: {
      email: 'admin@bizzriser.com',
      passwordHash,
      firstName: 'Default',
      lastName: 'Business',
      role: UserRole.ORG_ADMIN,
      organizationId: org.id,
    },
  });

  console.log('--- SEEDING COMPLETE ---');
  console.log('Super Admin 1: superadmin@bizzriser.com / password123');
  console.log('Super Admin 2: divyarajmakwanabusiness@gmail.com / BizzRiser@79');
  console.log('Org Admin:     admin@bizzriser.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
