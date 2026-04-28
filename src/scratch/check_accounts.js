const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.whatsAppAccount.findMany({
    select: {
      id: true,
      displayName: true,
      organizationId: true
    }
  });
  console.log('--- WhatsApp Accounts in DB ---');
  console.log(JSON.stringify(accounts, null, 2));

  const orgs = await prisma.organization.findMany();
  console.log('--- Organizations in DB ---');
  console.log(JSON.stringify(orgs.map(o => ({ id: o.id, name: o.name })), null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
