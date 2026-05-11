const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contact = await prisma.contact.findFirst({
    where: { phone: '916353239919' }
  });
  console.log('Contact ID:', contact.id);
  process.exit(0);
}

main().catch(console.error);
