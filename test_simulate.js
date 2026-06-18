const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module.js');
const { FlowExecutorService } = require('./dist/modules/chatbots/executor/flow-executor.service.js');
const { PrismaService } = require('./dist/prisma/prisma.service.js');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const flowExecutor = app.get(FlowExecutorService);
  const prisma = app.get(PrismaService);

  const chatbot = await prisma.chatbot.findUnique({
    where: { id: '8f8e0a7b-03f2-4de2-9109-5602326db3a2' }
  });
  
  const sendDataNode = chatbot.flowData.nodes.find(n => n.type === 'sendData');
  const triggerNode = chatbot.flowData.nodes.find(n => n.type === 'triggerNode');

  // Let's create a fake session
  const session = await prisma.chatbotSession.create({
    data: {
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      chatbotId: chatbot.id,
      contactId: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b',
      accountId: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7',
      currentNodeId: sendDataNode.id,
      status: 'ACTIVE',
      variables: {},
    }
  });

  const contact = await prisma.contact.findUnique({
    where: { id: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b' }
  });

  console.log('--- STARTING NODE EXECUTION ---');
  try {
    await flowExecutor.executeNode(session, sendDataNode, chatbot.flowData.edges, chatbot.flowData.nodes, contact, {});
    console.log('--- EXECUTED NODE ---');
  } catch(e) {
    console.error('ERROR:', e.message);
  }

  // Cleanup session
  await prisma.chatbotSession.delete({ where: { id: session.id } });
  
  await app.close();
}

bootstrap().catch(console.error);
