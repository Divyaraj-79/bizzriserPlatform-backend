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

async function runTimed(label, fn) {
  const start = Date.now();
  await fn();
  const end = Date.now();
  console.log(`${label}: ${end - start} ms`);
}

async function main() {
  const orgId = '2d672d52-30df-484b-bd07-650ba09f22a6';
  const messageWhere = { organizationId: orgId };
  const campaignWhere = { organizationId: orgId };
  const chartMessageWhere = { 
    organizationId: orgId,
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  };

  console.log('--- Timing individual queries ---');

  await runTimed('1. Outbound Message GroupBy', () => prisma.message.groupBy({
    by: ['status'],
    where: { ...messageWhere, direction: 'OUTBOUND' },
    _count: { id: true },
  }));

  await runTimed('2. Inbound Message Count', () => prisma.message.count({
    where: { ...messageWhere, direction: 'INBOUND' },
  }));

  await runTimed('3. Recent Pairs FindMany', () => prisma.message.findMany({
    where: messageWhere,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { createdAt: true, direction: true, contactId: true }
  }));

  await runTimed('4. Active Campaigns Count', () => prisma.campaign.count({
    where: { ...campaignWhere, status: { in: ['RUNNING', 'SCHEDULED'] } },
  }));

  await runTimed('5. Total Campaigns Count', () => prisma.campaign.count({
    where: campaignWhere,
  }));

  await runTimed('6. Unique Contacts Count', () => prisma.contact.count({
    where: { organizationId: orgId },
  }));

  await runTimed('7. Total Chatbots Count', () => prisma.chatbot.count({ where: { organizationId: orgId } }));
  
  await runTimed('8. Chatbot Executions Sum', () => prisma.chatbot.aggregate({
    where: { organizationId: orgId },
    _sum: { executions: true }
  }));

  await runTimed('9. Total Sequences Count', () => prisma.sequence.count({ where: { organizationId: orgId } }));

  await runTimed('10. Sequence Executions Sum', () => prisma.sequence.aggregate({
    where: { organizationId: orgId },
    _sum: { executions: true }
  }));

  await runTimed('11. Recent Messages (Chart Data) FindMany', () => prisma.message.findMany({
    where: chartMessageWhere,
    select: { createdAt: true, direction: true, status: true },
    take: 1000
  }));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
