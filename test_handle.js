const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const chatbot = await prisma.chatbot.findUnique({
    where: { id: '8f8e0a7b-03f2-4de2-9109-5602326db3a2' }
  });
  
  const sendDataNode = chatbot.flowData.nodes.find(n => n.type === 'sendData');
  console.log('Testing handleSendData with config:', sendDataNode.data.config);

  const config = sendDataNode.data.config || {};
  const dataType = config.dataType || 'TEXT';

  let mediaUrl = config.mediaUrl;
  console.log('1. uploadMethod:', config.uploadMethod, 'mediaUrl:', mediaUrl);

  let type = 'IMAGE';
  if (dataType === 'VIDEO') type = 'VIDEO';
  if (dataType === 'AUDIO') type = 'AUDIO';
  if (dataType === 'DOCUMENT') type = 'DOCUMENT';

  console.log('2. Type mapped to:', type);

  console.log('3. Would call sendBotMessageAndTrack with link:', mediaUrl);
  
  // Try to mimic createMessage validation
  try {
    const dummySession = {
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      whatsappAccountId: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7',
      contactId: '323b0d70-ca1e-4ffa-9237-29eb3abcc16b',
    };
    
    // Test creating the message
    const msg = await prisma.message.create({
      data: {
        organizationId: dummySession.organizationId,
        whatsappAccountId: dummySession.whatsappAccountId,
        contactId: dummySession.contactId,
        direction: 'OUTBOUND',
        type: type,
        content: { link: mediaUrl },
        metadata: { isChatbot: true },
        sentAt: new Date(),
        status: 'PENDING'
      }
    });
    console.log('4. createMessage success!', msg.id);
    
    // delete it
    await prisma.message.delete({ where: { id: msg.id } });
  } catch (err) {
    console.error('4. createMessage FAILED:', err.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
