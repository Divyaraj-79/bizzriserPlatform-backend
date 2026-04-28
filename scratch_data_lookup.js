const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING TARGETTED DATA SEARCH ---');
  
  const targetUser = await prisma.user.findFirst({
    where: {
       OR: [
          { email: 'superadmin@bizzriser.com' },
          { firstName: 'BizzRiser', lastName: 'Admin' }
       ]
    }
  });

  if (!targetUser) {
    console.log('Could not find user BizzRiser Admin');
    const allUsers = await prisma.user.findMany({ select: { email: true, firstName: true, lastName: true, organizationId: true } });
    console.log('All Users:', JSON.stringify(allUsers, null, 2));
    return;
  }

  console.log('Found Active User:', {
    id: targetUser.id,
    email: targetUser.email,
    orgId: targetUser.organizationId,
    role: targetUser.role
  });

  const exactCount = await prisma.contact.count({
    where: { organizationId: targetUser.organizationId }
  });

  console.log(`Contacts for User's Org (${targetUser.organizationId}):`, exactCount);

  if (exactCount === 0) {
    console.log('User Org is empty. Searching for ANY contact to find correct Org ID...');
    const firstContact = await prisma.contact.findFirst();
    if (firstContact) {
      console.log('System contains contacts for Org:', firstContact.organizationId);
      const totalGlobal = await prisma.contact.count();
      console.log('Total Global Contacts:', totalGlobal);
    } else {
      console.log('NO CONTACTS EXIST IN THE ENTIRE DATABASE.');
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
