import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const packages = [
    {
      name: 'Basic',
      description: 'Perfect for small businesses getting started with WhatsApp automation.',
      price: 29.0,
      contactLimit: 1000,
      messageLimit: 5000,
      campaignLimit: 5,
      chatbotLimit: 1,
      teamMemberLimit: 2,
      features: ['Basic Automation', '1 WhatsApp Number', 'Email Support'],
    },
    {
      name: 'Pro',
      description: 'Advanced features for growing teams and automated marketing.',
      price: 99.0,
      contactLimit: 10000,
      messageLimit: 50000,
      campaignLimit: 20,
      chatbotLimit: 5,
      teamMemberLimit: 5,
      features: ['Advanced Automation', 'Up to 3 WhatsApp Numbers', 'Priority Support', 'Custom Fields'],
    },
    {
      name: 'Advanced',
      description: 'Enterprise-grade limits and dedicated support for large scale operations.',
      price: 299.0,
      contactLimit: 0, // 0 = unlimited
      messageLimit: 0,
      campaignLimit: 0,
      chatbotLimit: 0,
      teamMemberLimit: 0,
      features: ['Unlimited Everything', 'Dedicated Account Manager', 'Custom API Access', 'SLA Guarantee'],
    }
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: pkg,
    });
    console.log(`Upserted package: ${pkg.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
