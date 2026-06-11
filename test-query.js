const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tags = ['test'];
    const countRawArray = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM contacts WHERE tags && ${tags}`;
    console.log('Count Raw Array Param:', countRawArray);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
