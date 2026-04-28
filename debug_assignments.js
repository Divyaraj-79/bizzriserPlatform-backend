const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    where: { email: 'qdakshraj@gmail.com' },
    include: {
      accountAccess: {
        include: {
          customRole: true,
          whatsappAccount: true
        }
      }
    }
  });

  console.log(JSON.stringify(users, null, 2));
  
  const roles = await prisma.role.findMany({
    include: {
      _count: { select: { accountAccess: true } }
    }
  });
  console.log('Roles Count:', JSON.stringify(roles, null, 2));

  process.exit(0);
}

run();
