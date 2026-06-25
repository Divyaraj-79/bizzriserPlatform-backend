const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Manually load env variables
const dotenvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(dotenvPath)) {
  const envConfig = fs.readFileSync(dotenvPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (matched) {
      const key = matched[1];
      let value = matched[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.length > 0 && value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  }
}

const prisma = new PrismaClient();

async function main() {
  const orgId = '2d672d52-30df-484b-bd07-650ba09f22a6'; // Active organization in DB
  console.log(`Starting performance benchmark for Org: ${orgId}`);

  // Test 1: getOverview simulation (equivalent to /api/v1/analytics/overview)
  console.log('\n--- Running Analytics Overview benchmark ---');
  const startAnalytics = Date.now();
  
  const messageWhere = { organizationId: orgId };
  const campaignWhere = { organizationId: orgId };
  const chartMessageWhere = { 
    organizationId: orgId,
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  };

  const [
    messageStats,
    inboundCount,
    recentPairs,
    activeCampaigns,
    totalCampaigns,
    uniqueContacts,
    totalChatbots,
    chatbotExecutions,
    totalSequences,
    sequenceExecutions,
    recentMessages
  ] = await Promise.all([
    prisma.message.groupBy({
      by: ['status'],
      where: { ...messageWhere, direction: 'OUTBOUND' },
      _count: { id: true },
    }),
    prisma.message.count({
      where: { ...messageWhere, direction: 'INBOUND' },
    }),
    prisma.message.findMany({
      where: messageWhere,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { createdAt: true, direction: true, contactId: true }
    }),
    prisma.campaign.count({
      where: { ...campaignWhere, status: { in: ['RUNNING', 'SCHEDULED'] } },
    }),
    prisma.campaign.count({
      where: campaignWhere,
    }),
    prisma.contact.count({
      where: { organizationId: orgId },
    }),
    prisma.chatbot.count({ where: { organizationId: orgId } }),
    prisma.chatbot.aggregate({
      where: { organizationId: orgId },
      _sum: { executions: true }
    }),
    prisma.sequence.count({ where: { organizationId: orgId } }),
    prisma.sequence.aggregate({
      where: { organizationId: orgId },
      _sum: { executions: true }
    }),
    prisma.message.findMany({
      where: chartMessageWhere,
      select: { createdAt: true, direction: true, status: true },
      take: 1000
    })
  ]);

  const endAnalytics = Date.now();
  console.log(`✅ Analytics Overview completed in: ${endAnalytics - startAnalytics} ms!`);

  // Test 2: findAll simulation (equivalent to /api/v1/contacts)
  console.log('\n--- Running Contacts List pagination benchmark ---');
  const startContacts = Date.now();

  const where = { organizationId: orgId };
  const [data, total, statusGroups] = await Promise.all([
    prisma.contact.findMany({
      where,
      skip: 0,
      take: 10,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.contact.count({ where }),
    prisma.contact.groupBy({
      by: ['status'],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
  ]);

  let activeCount = 0;
  let blockedCount = 0;
  statusGroups.forEach((g) => {
    if (g.status === 'ACTIVE') activeCount = g._count.id || 0;
    if (g.status === 'BLOCKED') blockedCount = g._count.id || 0;
  });

  const endContacts = Date.now();
  console.log(`✅ Contacts List completed in: ${endContacts - startContacts} ms!`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
