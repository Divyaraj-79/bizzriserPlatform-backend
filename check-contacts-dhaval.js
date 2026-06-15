const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { phone: '918866110637' }
  });
  console.log(JSON.stringify(contacts, null, 2));

  // Get all messages for all these contacts
  const msgs = await prisma.message.findMany({
    where: { contactId: { in: contacts.map(c => c.id) } }
  });
  console.log("All Messages:", JSON.stringify(msgs, null, 2));
}

main().finally(() => {
  prisma.$disconnect();
});
