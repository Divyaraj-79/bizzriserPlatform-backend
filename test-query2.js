const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const rawResult = await prisma.$queryRaw`
      SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(ARRAY['a', 'b']::text[], '{}') || COALESCE(ARRAY['b', 'c']::text[], '{}'))) as res
    `;
    console.log('Result:', rawResult);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
