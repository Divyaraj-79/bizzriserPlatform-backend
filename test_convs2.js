const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const convs = await prisma.conversation.findMany({ 
      where: { section: 'PRIMARY' }, 
      take: 5, 
      include: { contact: true, whatsappAccount: true } 
  });
  console.log('Conversations count:', convs.length);
  if (convs.length > 0) {
      console.log('First conversation organizationId:', convs[0].organizationId);
      console.log('First conversation contact phone:', convs[0].contact?.phone);
  }
}
main().finally(() => prisma.$disconnect());
