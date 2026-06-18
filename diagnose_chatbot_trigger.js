/**
 * diagnose_chatbot_trigger.js
 * Run with: node diagnose_chatbot_trigger.js
 * 
 * This script checks all conditions that could prevent a chatbot from triggering.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ORG_ID = '2d672d52-30df-484b-bd07-650ba09f22a6';
const CHATBOT_ID = '8f8e0a7b-03f2-4de2-9109-5602326db3a2';

async function main() {
  console.log('\n========== CHATBOT TRIGGER DIAGNOSTICS ==========\n');

  // ── STEP 1: Check the chatbot itself ──────────────────────────────────────
  console.log('📋 [STEP 1] Checking chatbot record...');
  const chatbot = await prisma.chatbot.findUnique({ where: { id: CHATBOT_ID } });
  if (!chatbot) {
    console.error('❌ CHATBOT NOT FOUND! ID:', CHATBOT_ID);
    return;
  }
  console.log(`   Name:        "${chatbot.name}"`);
  console.log(`   Status:      ${chatbot.status}  ${chatbot.status === 'ACTIVE' ? '✅' : '❌ NOT ACTIVE!'}`);
  console.log(`   Channel:     ${chatbot.channel}  ${chatbot.channel === 'WHATSAPP' ? '✅' : '❌ NOT WHATSAPP!'}`);
  console.log(`   TriggerType: ${chatbot.triggerType}`);
  console.log(`   Keywords:    ${JSON.stringify(chatbot.keywords)}`);

  const flowData = chatbot.flowData;
  const nodes = flowData?.nodes || [];
  const edges = flowData?.edges || [];
  console.log(`   Flow Nodes:  ${nodes.length}  ${nodes.length > 0 ? '✅' : '❌ NO NODES IN FLOW!'}`);
  console.log(`   Flow Edges:  ${edges.length}`);

  if (nodes.length > 0) {
    const triggerNode = nodes.find(n => n.type === 'triggerNode' || n.data?.isTrigger) || nodes[0];
    console.log(`   Trigger Node ID: ${triggerNode.id} (type: ${triggerNode.type})`);
    const nextEdge = edges.find(e => e.source === triggerNode.id);
    if (nextEdge) {
      const nextNode = nodes.find(n => n.id === nextEdge.target);
      console.log(`   Next Node:   ${nextNode?.type || 'UNKNOWN'} (id: ${nextEdge.target})`);
    } else {
      console.warn('   ⚠️  No edge connected from trigger node!');
    }
  }

  // Keyword check
  if (chatbot.triggerType === 'KEYWORD_MATCH') {
    const testMsg = 'start';
    const matched = chatbot.keywords.some(k => testMsg.toLowerCase().includes(k.toLowerCase()));
    console.log(`\n   🔍 KEYWORD TEST: Does "start" match keywords ${JSON.stringify(chatbot.keywords)}?`);
    console.log(`   Result: ${matched ? '✅ YES — Will trigger' : '❌ NO — Will NOT trigger!'}`);
    if (!matched && chatbot.keywords.length === 0) {
      console.log('   ⚠️  Keywords array is EMPTY. Add "start" to the keywords list!');
    }
  }

  // ── STEP 2: Check WhatsApp account ────────────────────────────────────────
  console.log('\n📋 [STEP 2] Checking WhatsApp accounts for this org...');
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { organizationId: ORG_ID },
    select: { id: true, displayName: true, phoneNumber: true, phoneNumberId: true, wabaId: true, status: true }
  });

  if (accounts.length === 0) {
    console.error('❌ NO WHATSAPP ACCOUNTS FOUND for org!');
  } else {
    for (const acc of accounts) {
      console.log(`\n   Account: "${acc.displayName}"`);
      console.log(`     DB id (whatsappAccountId): ${acc.id}`);
      console.log(`     phoneNumberId:             ${acc.phoneNumberId}`);
      console.log(`     phoneNumber:               ${acc.phoneNumber}`);
      console.log(`     wabaId:                    ${acc.wabaId}`);
      console.log(`     status:                    ${acc.status}`);
      console.log('\n   ⚠️  IMPORTANT: In webhook payload, metadata.phone_number_id must match:');
      console.log(`     "${acc.phoneNumberId}"`);
      console.log(`   NOT the account\'s id ("${acc.id}")`);
    }
  }

  // ── STEP 3: Check for stale active sessions ────────────────────────────────
  console.log('\n📋 [STEP 3] Checking for stale chatbot sessions (WAITING_REPLY / ACTIVE)...');
  const staleSessions = await prisma.chatbotSession.findMany({
    where: {
      organizationId: ORG_ID,
      status: { in: ['WAITING_REPLY', 'ACTIVE'] }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  if (staleSessions.length > 0) {
    console.log(`   ⚠️  Found ${staleSessions.length} active/waiting session(s):`);
    for (const s of staleSessions) {
      console.log(`     Session ${s.id}: status=${s.status}, chatbotId=${s.chatbotId}, contactId=${s.contactId}, createdAt=${s.createdAt}`);
    }
    console.log('   These sessions will intercept incoming messages and prevent new trigger matching!');
    console.log('   If these are stale, run: node fix_stale_sessions.js');
  } else {
    console.log('   ✅ No stale sessions found.');
  }

  // ── STEP 4: Check recent webhook events ───────────────────────────────────
  console.log('\n📋 [STEP 4] Checking recent webhook events...');
  const recentEvents = await prisma.webhookEvent.findMany({
    where: { organizationId: ORG_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, eventType: true, processed: true, error: true, retryCount: true, createdAt: true }
  });

  if (recentEvents.length === 0) {
    console.log('   ❌ No webhook events found! Webhook is not reaching the backend.');
    console.log('   → Check that Meta is sending to the right webhook URL.');
    console.log('   → Check that phone_number_id in the payload matches your account.');
  } else {
    console.log(`   Found ${recentEvents.length} recent events:`);
    for (const e of recentEvents) {
      const icon = e.processed ? '✅' : (e.error ? '❌' : '⏳');
      console.log(`   ${icon} [${e.createdAt.toISOString()}] ${e.eventType} | processed=${e.processed} | error=${e.error || 'none'} | retries=${e.retryCount}`);
    }
  }

  // ── STEP 5: Summary & recommendations ────────────────────────────────────
  console.log('\n========== SUMMARY & RECOMMENDATIONS ==========\n');
  console.log('Common reasons the chatbot is NOT triggering:\n');
  console.log('1. ❗ WRONG phone_number_id in webhook payload');
  console.log('   → The webhook uses metadata.phone_number_id to find the WA account in DB.');
  console.log('   → It must match the phoneNumberId stored in the whatsapp_accounts table.');
  console.log('   → Check the accounts printed above and fix your Meta webhook / test script.\n');

  console.log('2. ❗ Keywords array is empty or "start" not in keywords');
  console.log('   → Go to Bot Manager → Chatbot Settings → add "start" as a keyword.\n');

  console.log('3. ❗ Flow has no nodes saved');
  console.log('   → If flowData.nodes is empty, startSession() silently returns.');
  console.log('   → Open the chatbot builder and make sure the flow is SAVED.\n');

  console.log('4. ❗ Stale WAITING_REPLY session for the contact');
  console.log('   → If a session is stuck in WAITING_REPLY, all incoming msgs go to resumeSession().');
  console.log('   → Clean stale sessions from the DB.\n');

  console.log('5. ❗ Chatbot channel mismatch');
  console.log('   → activeBots query filters channel=WHATSAPP. Make sure chatbot.channel is set correctly.\n');
}

main()
  .catch(e => { console.error('Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
