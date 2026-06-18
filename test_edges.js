const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const chatbot = await prisma.chatbot.findUnique({
    where: { id: '8f8e0a7b-03f2-4de2-9109-5602326db3a2' }
  });
  
  console.log('edges:', JSON.stringify(chatbot.flowData.edges, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
