const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const rawResult = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='contacts'`;
    console.log('Columns:', rawResult);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
