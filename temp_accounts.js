const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.whatsAppAccount.findMany().then(accs => console.log('WhatsApp Accounts:', accs)).finally(() => prisma.$disconnect());
