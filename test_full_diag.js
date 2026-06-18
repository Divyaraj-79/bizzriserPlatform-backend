const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Check chatbot status and config
  const chatbot = await prisma.chatbot.findUnique({
    where: { id: '8f8e0a7b-03f2-4de2-9109-5602326db3a2' }
  });
  
  console.log('=== CHATBOT CONFIG ===');
  console.log('Name:', chatbot.name);
  console.log('Status:', chatbot.status);
  console.log('Channel:', chatbot.channel);
  console.log('TriggerType:', chatbot.triggerType);
  console.log('Keywords:', chatbot.keywords);
  console.log('');

  // 2. Check if there are any ACTIVE chatbots for this org
  const activeBots = await prisma.chatbot.findMany({
    where: { organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6', status: 'ACTIVE', channel: 'WHATSAPP' }
  });
  console.log('=== ACTIVE WHATSAPP BOTS ===');
  activeBots.forEach(b => {
    console.log(`  - ${b.name} | Status: ${b.status} | Trigger: ${b.triggerType} | Keywords: ${JSON.stringify(b.keywords)}`);
  });
  console.log('');

  // 3. Check recent webhook events
  const events = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('=== RECENT WEBHOOK EVENTS ===');
  events.forEach(e => {
    console.log(`  - ${e.id} | Type: ${e.eventType} | Processed: ${e.processed} | Error: ${e.error} | Created: ${e.createdAt}`);
  });
  console.log('');

  // 4. Check recent sessions
  const sessions = await prisma.chatbotSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('=== RECENT SESSIONS ===');
  sessions.forEach(s => {
    console.log(`  - ${s.id} | Status: ${s.status} | Node: ${s.currentNodeId} | Created: ${s.createdAt}`);
  });
  console.log('');

  // 5. Check recent inbound messages (last 30 min)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const recentInbound = await prisma.message.findMany({
    where: {
      direction: 'INBOUND',
      createdAt: { gte: thirtyMinAgo }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('=== INBOUND MESSAGES (LAST 30 MIN) ===');
  recentInbound.forEach(m => {
    console.log(`  - ${m.id} | Content: ${JSON.stringify(m.content)} | Created: ${m.createdAt}`);
  });
  
  // 6. Check recent outbound messages (last 30 min)
  const recentOutbound = await prisma.message.findMany({
    where: {
      direction: 'OUTBOUND',
      createdAt: { gte: thirtyMinAgo }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('\n=== OUTBOUND MESSAGES (LAST 30 MIN) ===');
  recentOutbound.forEach(m => {
    console.log(`  - ${m.id} | Type: ${m.type} | Content: ${JSON.stringify(m.content).substring(0, 100)} | Created: ${m.createdAt}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
