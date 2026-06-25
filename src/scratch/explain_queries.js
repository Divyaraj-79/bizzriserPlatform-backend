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
  const orgId = '2d672d52-30df-484b-bd07-650ba09f22a6';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  console.log('--- Outbound Message GroupBy EXPLAIN ---');
  const plan1 = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT "status", COUNT(*)::int
    FROM "messages"
    WHERE "organizationId" = '${orgId}' AND "direction" = 'OUTBOUND'
    GROUP BY "status"
  `);
  console.log(plan1.map(row => row['QUERY PLAN']).join('\n'));

  console.log('\n--- Recent Messages (Chart Data) EXPLAIN ---');
  const plan2 = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT "createdAt", "direction", "status"
    FROM "messages"
    WHERE "organizationId" = '${orgId}' AND "createdAt" >= '${thirtyDaysAgo}'
    LIMIT 1000
  `);
  console.log(plan2.map(row => row['QUERY PLAN']).join('\n'));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
