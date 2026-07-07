const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const counts = {
    contacts: await prisma.contact.count(),
    chatbots: await prisma.chatbot.count(),
    messages: await prisma.message.count(),
    users: await prisma.user.count(),
    organizations: await prisma.organization.count()
  };
  console.log(counts);
}

run().finally(() => prisma.$disconnect());
