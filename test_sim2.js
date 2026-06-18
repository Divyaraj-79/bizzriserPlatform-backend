const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.chatbotSession.create({
    data: {
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      chatbotId: '8f8e0a7b-03f2-4de2-9109-5602326db3a2',
      contactId: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b',
      accountId: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7',
      currentNodeId: 'sendData-1779964651578',
      status: 'ACTIVE',
      variables: {},
    }
  });

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('./dist/app.module.js');
  const { FlowExecutorService } = require('./dist/modules/chatbots/executor/flow-executor.service.js');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const flowExecutor = app.get(FlowExecutorService);

  const chatbot = await prisma.chatbot.findUnique({
    where: { id: '8f8e0a7b-03f2-4de2-9109-5602326db3a2' }
  });
  
  const sendDataNode = chatbot.flowData.nodes.find(n => n.type === 'sendData');
  const contact = await prisma.contact.findUnique({
    where: { id: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b' }
  });

  console.log('--- EXECUTING ---');
  await flowExecutor.executeNode(session, sendDataNode, chatbot.flowData.edges, chatbot.flowData.nodes, contact, {});
  
  console.log('--- CHECKING DB ---');
  const messages = await prisma.message.findMany({
    where: { direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  console.log('Latest outbound:', messages);

  await app.close();
}

main().catch(console.error).finally(() => prisma.$disconnect());
