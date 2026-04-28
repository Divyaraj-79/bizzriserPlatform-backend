const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- RBAC Audit: User & Account Access ---');
  
  const users = await prisma.user.findMany({
    where: { role: 'AGENT' },
    include: {
      accountAccess: {
        include: {
          whatsappAccount: true,
          customRole: true
        }
      }
    },
    take: 5
  });

  if (users.length === 0) {
    console.log('No Agent users found.');
  } else {
    users.forEach(u => {
      console.log(`User: ${u.firstName} ${u.lastName} (${u.email})`);
      if (u.accountAccess.length === 0) {
        console.log('  -> No assigned accounts.');
      } else {
        u.accountAccess.forEach(aa => {
          console.log(`  -> Account: ${aa.whatsappAccount.displayName} | Role: ${aa.customRole?.name || 'N/A'}`);
          console.log(`     Permissions: ${JSON.stringify(aa.customRole?.permissions)}`);
        });
      }
      console.log('---');
    });
  }

  const accounts = await prisma.whatsAppAccount.findMany({ take: 5 });
  console.log('\n--- Available WhatsApp Accounts ---');
  accounts.forEach(a => {
    console.log(`ID: ${a.id} | Name: ${a.displayName} | Phone: ${a.phoneNumber}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
