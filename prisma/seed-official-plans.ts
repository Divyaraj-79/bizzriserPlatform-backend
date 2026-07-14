const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const basicFeatures = [
  '1,50,000 WhatsApp broadcasting credits/period',
  '1 WhatsApp Business number connection',
  'Unlimited contact imports',
  'Broadcast campaigns to up to 1,50,000 contacts',
  'CSV & Excel bulk import',
  'Contact tagging & segmentation',
  'Custom contact fields (up to 10)',
  'Basic chatbot builder (up to 2 bots)',
  'WhatsApp template message support',
  'Basic analytics dashboard',
  'Message delivery & read receipts tracking',
  '2 team member seats',
  'Email support (48-hour response)',
  'Automated opt-in/opt-out handling',
  'Interactive message buttons & lists'
];

const growthFeatures = [
  '3,00,000 WhatsApp broadcasting credits/period',
  '3 WhatsApp Business number connections',
  'Broadcast campaigns to up to 3,00,000 contacts',
  'Advanced chatbot flows (up to 10 bots)',
  'Drip sequence / automation campaigns',
  'WhatsApp flow builder',
  'E-commerce catalogue integration',
  'Coupon & discount management',
  'CRM integration support',
  'Advanced analytics & reports',
  '5 team member seats',
  'Priority email + WhatsApp support',
  'Custom contact fields (up to 50)',
  'API Webhook event subscriptions',
  'Multi-agent shared inbox',
  'Smart message routing'
];

const advancedFeatures = [
  '5,00,000 WhatsApp broadcasting credits/period',
  'Unlimited WhatsApp number connections',
  'Broadcast campaigns to up to 5,00,000 contacts',
  'Unlimited chatbots',
  'Unlimited team member seats',
  'API access & webhooks',
  'Custom webhook integrations',
  'Dedicated account manager',
  'Priority onboarding assistance',
  'White-glove support',
  'SLA guarantee',
  'Custom contact fields (Unlimited)',
  'Advanced developer API access',
  'Multi-location support',
  'Role-based granular access control',
  'Custom branded portal'
];

const customFeatures = [
  'Custom WhatsApp broadcasting credits',
  'Custom pricing & billing terms',
  'Dedicated infrastructure',
  'Custom feature development',
  'Enterprise SLA',
  'On-premise deployment option',
  'Contact our sales team',
  'Unlimited everything else',
  'Custom API integrations',
  '24/7 dedicated phone support',
  'Quarterly business reviews',
  'Volume discounts'
];

async function main() {
  console.log('Seeding official BizzRiser plans...');

  // Remove deleteMany to prevent foreign key errors on existing data
  // await prisma.package.deleteMany();

  const basicPlan = await prisma.package.upsert({
    where: { name: 'Basic' },
    update: {
      description: 'Perfect for small businesses starting out.',
      monthlyPrice: 0,
      quarterlyPrice: 3499,
      yearlyPrice: 2999,
      credits: 150000,
      features: basicFeatures,
      whatsappAccountLimit: 1,
      chatbotLimit: 2,
      teamMemberLimit: 2,
      contactImportLimit: -1,
      broadcastContactLimit: 150000,
      broadcastAllowed: true,
      sequencesAllowed: false,
      isActive: true,
      isContactOnly: false,
      sortOrder: 1
    },
    create: {
      name: 'Basic',
      description: 'Perfect for small businesses starting out.',
      monthlyPrice: 0,
      quarterlyPrice: 3499,
      yearlyPrice: 2999,
      credits: 150000,
      features: basicFeatures,
      whatsappAccountLimit: 1,
      chatbotLimit: 2,
      teamMemberLimit: 2,
      contactImportLimit: -1,
      broadcastContactLimit: 150000,
      broadcastAllowed: true,
      sequencesAllowed: false,
      isActive: true,
      isContactOnly: false,
      sortOrder: 1
    }
  });

  const growthPlan = await prisma.package.upsert({
    where: { name: 'Growth' },
    update: {
      description: 'Ideal for growing teams automating sales.',
      monthlyPrice: 0,
      quarterlyPrice: 4499,
      yearlyPrice: 3999,
      credits: 300000,
      features: growthFeatures,
      whatsappAccountLimit: 3,
      chatbotLimit: 10,
      teamMemberLimit: 5,
      contactImportLimit: -1,
      broadcastContactLimit: 300000,
      broadcastAllowed: true,
      sequencesAllowed: true,
      isActive: true,
      isContactOnly: false,
      sortOrder: 2
    },
    create: {
      name: 'Growth',
      description: 'Ideal for growing teams automating sales.',
      monthlyPrice: 0,
      quarterlyPrice: 4499,
      yearlyPrice: 3999,
      credits: 300000,
      features: growthFeatures,
      whatsappAccountLimit: 3,
      chatbotLimit: 10,
      teamMemberLimit: 5,
      contactImportLimit: -1,
      broadcastContactLimit: 300000,
      broadcastAllowed: true,
      sequencesAllowed: true,
      isActive: true,
      isContactOnly: false,
      sortOrder: 2
    }
  });

  const advancedPlan = await prisma.package.upsert({
    where: { name: 'Advanced' },
    update: {
      description: 'For power users needing maximum limits.',
      monthlyPrice: 0,
      quarterlyPrice: 5499,
      yearlyPrice: 4999,
      credits: 500000,
      features: advancedFeatures,
      whatsappAccountLimit: -1,
      chatbotLimit: -1,
      teamMemberLimit: -1,
      contactImportLimit: -1,
      broadcastContactLimit: 500000,
      broadcastAllowed: true,
      sequencesAllowed: true,
      isActive: true,
      isContactOnly: false,
      sortOrder: 3
    },
    create: {
      name: 'Advanced',
      description: 'For power users needing maximum limits.',
      monthlyPrice: 0,
      quarterlyPrice: 5499,
      yearlyPrice: 4999,
      credits: 500000,
      features: advancedFeatures,
      whatsappAccountLimit: -1,
      chatbotLimit: -1,
      teamMemberLimit: -1,
      contactImportLimit: -1,
      broadcastContactLimit: 500000,
      broadcastAllowed: true,
      sequencesAllowed: true,
      isActive: true,
      isContactOnly: false,
      sortOrder: 3
    }
  });

  const customPlan = await prisma.package.upsert({
    where: { name: 'Custom' },
    update: {
      description: 'Enterprise grade solutions and high volumes.',
      monthlyPrice: 0,
      quarterlyPrice: 0,
      yearlyPrice: 0,
      credits: -1,
      features: customFeatures,
      whatsappAccountLimit: -1,
      chatbotLimit: -1,
      teamMemberLimit: -1,
      contactImportLimit: -1,
      broadcastContactLimit: -1,
      broadcastAllowed: true,
      sequencesAllowed: true,
      isActive: true,
      isContactOnly: true,
      sortOrder: 4
    },
    create: {
      name: 'Custom',
      description: 'Enterprise grade solutions and high volumes.',
      monthlyPrice: 0,
      quarterlyPrice: 0,
      yearlyPrice: 0,
      credits: -1,
      features: customFeatures,
      whatsappAccountLimit: -1,
      chatbotLimit: -1,
      teamMemberLimit: -1,
      contactImportLimit: -1,
      broadcastContactLimit: -1,
      broadcastAllowed: true,
      sequencesAllowed: true,
      isActive: true,
      isContactOnly: true,
      sortOrder: 4
    }
  });

  console.log('Seeded successfully!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
