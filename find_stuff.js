const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({
    include: {
      organization: {
        include: {
          _count: {
            select: {
              contacts: true,
              chatbots: true,
              whatsappAccounts: true
            }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(users, null, 2));
}

run().finally(() => prisma.$disconnect());
