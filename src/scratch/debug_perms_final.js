const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'qdakshraj@gmail.com' }
  });

  console.log('--- USER SYSTEM INFO ---');
  console.log('Email:', user.email);
  console.log('Role:', user.role);

  console.log('\n--- GLOBAL PERMISSIONS IN DB ---');
  console.log(JSON.stringify(user.permissions, null, 2));

  const access = await prisma.whatsAppAccountAccess.findFirst({
    where: { userId: user.id },
    include: { whatsappAccount: true, customRole: true }
  });

  if (access) {
    console.log('\n--- ACTIVE ACCOUNT ACCESS ---');
    console.log('Account:', access.whatsappAccount.displayName);
    console.log('Role:', access.customRole.name);
    console.log('Role Permissions:', JSON.stringify(access.customRole.permissions, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
