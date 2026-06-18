const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const updated = await p.whatsAppAccount.update({
    where: { id: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7' },
    data: { status: 'ACTIVE' }
  });
  console.log('WhatsApp Account status updated to:', updated.status, '(' + updated.displayName + ')');
}

main().catch(console.error).finally(() => p.$disconnect());
