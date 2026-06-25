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

async function runBenchmark(orgId) {
  const startAnalytics = Date.now();
  
  const messageWhere = { organizationId: orgId };
  const campaignWhere = { organizationId: orgId };
  const chartMessageWhere = { 
    organizationId: orgId,
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  };

  const [
    messageStats,
    recentPairs,
    campaignStats,
    uniqueContacts,
    chatbotStats,
    sequenceStats,
    recentMessages
  ] = await Promise.all([
    prisma.message.groupBy({
      by: ['direction', 'status'],
      where: messageWhere,
      _count: { id: true },
    }),
    prisma.message.findMany({
      where: messageWhere,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { createdAt: true, direction: true, contactId: true }
    }),
    prisma.campaign.groupBy({
      by: ['status'],
      where: campaignWhere,
      _count: { id: true },
    }),
    prisma.contact.count({
      where: { organizationId: orgId },
    }),
    prisma.chatbot.aggregate({
      where: { organizationId: orgId },
      _count: { id: true },
      _sum: { executions: true }
    }),
    prisma.sequence.aggregate({
      where: { organizationId: orgId },
      _count: { id: true },
      _sum: { executions: true }
    }),
    prisma.message.findMany({
      where: chartMessageWhere,
      select: { createdAt: true, direction: true, status: true },
      take: 1000
    })
  ]);

  return Date.now() - startAnalytics;
}

async function main() {
  const orgId = '2d672d52-30df-484b-bd07-650ba09f22a6';
  console.log(`Starting consolidated benchmark for Org: ${orgId}`);

  // Warm-up run to establish connections
  console.log('Running warm-up (Run 1)...');
  const t1 = await runBenchmark(orgId);
  console.log(`Run 1 completed in: ${t1} ms`);

  // Benchmark run
  console.log('Running benchmark (Run 2)...');
  const t2 = await runBenchmark(orgId);
  console.log(`Run 2 completed in: ${t2} ms`);

  // Benchmark run 3
  console.log('Running benchmark (Run 3)...');
  const t3 = await runBenchmark(orgId);
  console.log(`Run 3 completed in: ${t3} ms`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
