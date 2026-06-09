const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('--- RECIPIENT QUERY SIMULATION ---');
  // Get the contact for Dakshraj Chauhan
  const contact = await prisma.contact.findFirst({
    where: { phone: '919662206789' }
  });
  
  if (!contact) {
    console.log('Contact Dakshraj not found!');
    return;
  }
  
  console.log(`Found Contact: ${contact.firstName} (${contact.id})`);

  // Query 1: With status check
  const recipientWithStatus = await prisma.campaignRecipient.findFirst({
    where: {
      contactId: contact.id,
      firstResponse: null,
      status: { in: ['SENT', 'DELIVERED', 'READ'] },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  console.log('Query with status check:', recipientWithStatus ? 'FOUND' : 'NULL', recipientWithStatus);

  // Query 2: Without status check
  const recipientWithoutStatus = await prisma.campaignRecipient.findFirst({
    where: {
      contactId: contact.id,
      firstResponse: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  console.log('Query without status check:', recipientWithoutStatus ? 'FOUND' : 'NULL', recipientWithoutStatus);
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
