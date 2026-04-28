const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found');
    return;
  }

  const role = await prisma.role.create({
    data: {
      name: 'Chat Agent',
      organizationId: org.id,
      permissions: ['dashboard:view', 'inbox:view', 'chatbots:view']
    }
  });

  console.log('Role Created:', role.id);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
