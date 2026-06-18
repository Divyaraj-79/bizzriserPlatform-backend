const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('\n=== Sessions Created TODAY (June 18) ===');
  const sessions = await p.chatbotSession.findMany({
    where: {
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      createdAt: { gte: new Date('2026-06-18T00:00:00Z') }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Sessions today:', sessions.length);

  console.log('\n=== Inbound Messages TODAY ===');
  const msgs = await p.message.findMany({
    where: {
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      direction: 'INBOUND',
      createdAt: { gte: new Date('2026-06-18T00:00:00Z') }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Inbound messages today:', msgs.length);
  for (const m of msgs) {
    console.log(`  [${m.createdAt.toISOString()}] ${JSON.stringify(m.content)}`);
  }

  console.log('\n=== Webhook Events WITH Messages TODAY ===');
  const events = await p.webhookEvent.findMany({
    where: {
      organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6',
      createdAt: { gte: new Date('2026-06-18T00:00:00Z') }
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Total events today:', events.length);
  const msgEvents = events.filter(e => e.payload && e.payload.messages && e.payload.messages.length > 0);
  console.log('Events with MESSAGES:', msgEvents.length);

  if (msgEvents.length === 0) {
    console.log('\n❌ NO MESSAGE webhooks received today!');
    console.log('   When you sent "start" today, the webhook either:');
    console.log('   1. Did not reach the server (server offline?)');
    console.log('   2. Was rejected at signature validation');
    console.log('   3. Failed the phoneNumberId lookup (account was INACTIVE)');
    console.log('\n   The WA account status is INACTIVE - this may prevent Meta from delivering webhooks.');
  }

  // Check when the account became INACTIVE
  console.log('\n=== ALL sessions (last 30, most recent first) ===');
  const allSessions = await p.chatbotSession.findMany({
    where: { organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  for (const s of allSessions) {
    console.log(`  [${s.createdAt.toISOString()}] status=${s.status} node=${s.currentNodeId}`);
  }
  
  // Check outbound messages to understand what the sendData node did
  console.log('\n=== Recent OUTBOUND Messages (what the bot sent) ===');
  const outMsgs = await p.message.findMany({
    where: { organizationId: '2d672d52-30df-484b-bd07-650ba09f22a6', direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  for (const m of outMsgs) {
    console.log(`  [${m.createdAt.toISOString()}] type=${m.type} status=${m.status} content=${JSON.stringify(m.content)}`);
    if (m.status === 'FAILED') {
      console.log(`  ❌ FAILED REASON: ${m.failureReason}`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
