const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const rawResult = await prisma.$queryRaw`
      SELECT tag, COUNT(*)::int as count
      FROM contacts, UNNEST(tags) AS tag
      GROUP BY tag
    `;
    console.log('Result:', rawResult);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
