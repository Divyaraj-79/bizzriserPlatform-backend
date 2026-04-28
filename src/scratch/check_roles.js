const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany();
  console.log('--- Roles in DB with Permissions ---');
  console.log(JSON.stringify(roles.map(r => ({ 
    name: r.name, 
    orgId: r.organizationId, 
    permissions: r.permissions 
  })), null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
