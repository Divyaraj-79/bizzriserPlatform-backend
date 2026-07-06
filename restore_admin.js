const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function run() {
  const hash = await bcrypt.hash('BizzRiser@79', 10);
  
  const org = await prisma.organization.create({
    data: {
      name: 'BizzRiser Internal',
      slug: 'bizzriser-internal',
      status: 'ACTIVE'
    }
  });

  const user = await prisma.user.create({
    data: {
      email: 'divyarajmakwanabusiness@gmail.com',
      passwordHash: hash,
      firstName: 'Divyaraj',
      lastName: 'Makwana',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      organizationId: org.id
    }
  });
  
  console.log('Restored super admin:', user.email);
}

run().catch(console.error).finally(() => prisma.$disconnect());
