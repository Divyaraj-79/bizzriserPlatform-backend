const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.webhookEvent.count({ where: { createdAt: { gte: new Date('2026-04-28T00:00:00Z') } } }).then(c => console.log('Events today:', c)).finally(() => prisma.$disconnect());
