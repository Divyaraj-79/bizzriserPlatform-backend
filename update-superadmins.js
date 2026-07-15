
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const superadmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' } });
  for (const admin of superadmins) {
    if (admin.organizationId) {
      await prisma.organization.update({
        where: { id: admin.organizationId },
        data: { credits: -1, subscriptionStatus: 'ACTIVE', status: 'ACTIVE' }
      });
      console.log('Updated org for superadmin:', admin.email);
    }
  }
}
main().finally(() => prisma.$disconnect());

