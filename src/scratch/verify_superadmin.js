const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'superadmin@bizzriser.com';
  const user = await prisma.user.findFirst({ where: { email } });
  
  if (!user) {
    console.log(`User with email ${email} not found.`);
    // Try contains search
    const users = await prisma.user.findMany({ where: { email: { contains: 'superadmin' } } });
    console.log('Users found with superadmin in email:', JSON.stringify(users.map(u => ({ email: u.email, role: u.role, orgId: u.organizationId })), null, 2));
    return;
  }

  console.log(`User found: ${user.email} | Role: ${user.role} | OrgId: ${user.organizationId}`);
  
  const accounts = await prisma.whatsAppAccount.findMany({ where: { organizationId: user.organizationId } });
  console.log(`Accounts for this user's org (${user.organizationId}):`, JSON.stringify(accounts.map(a => a.displayName), null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
