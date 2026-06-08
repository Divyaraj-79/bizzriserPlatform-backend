const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  for (const c of campaigns) {
    console.log(`Campaign: ${c.name}`);
    console.log(`Template: ${c.templateName}`);
    console.log(`Params: ${JSON.stringify(c.templateParams, null, 2)}`);
    console.log('---');
  }
}
check().finally(() => prisma.$disconnect());
