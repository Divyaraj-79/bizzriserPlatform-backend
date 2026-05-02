
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Attempting to connect to the database...');
    await prisma.$connect();
    console.log('Successfully connected!');
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    console.log('Query result:', result);
  } catch (error) {
    console.error('Connection failed:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
