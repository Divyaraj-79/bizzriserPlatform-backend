import { PrismaClient } from '@prisma/client';
const Razorpay = require('razorpay');
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env relative to scripts directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET;

if (!key_id || !key_secret) {
  console.error("❌ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing in .env");
  process.exit(1);
}

const rzp = new Razorpay({ key_id, key_secret });

const plans = [
  {
    name: 'Basic',
    description: 'Perfect for small businesses starting out with WhatsApp marketing.',
    features: ['1 WhatsApp Account', '1000 Contacts', 'Basic Chatbot', 'Email Support'],
    pricing: {
      MONTHLY: 3000,
      QUARTERLY: 2800,
      YEARLY: 2500,
    },
    limits: { whatsappAccountLimit: 1, chatbotLimit: 1, contactImportLimit: 1000 }
  },
  {
    name: 'Growth',
    description: 'Ideal for growing teams looking to automate their sales flow.',
    features: ['3 WhatsApp Accounts', '10,000 Contacts', 'Advanced Chatbots & Sequences', 'Priority Support'],
    pricing: {
      MONTHLY: 4500,
      QUARTERLY: 4200,
      YEARLY: 4000,
    },
    limits: { whatsappAccountLimit: 3, chatbotLimit: 5, contactImportLimit: 10000 }
  },
  {
    name: 'Advanced',
    description: 'For power users requiring maximum limits and dedicated resources.',
    features: ['Unlimited WhatsApp Accounts', 'Unlimited Contacts', 'White-glove Onboarding', '24/7 Dedicated Support'],
    pricing: {
      MONTHLY: 6500,
      QUARTERLY: 6200,
      YEARLY: 6000,
    },
    limits: { whatsappAccountLimit: 9999, chatbotLimit: 9999, contactImportLimit: 999999 }
  }
];

async function main() {
  console.log("🚀 Starting package seeding...");

  await prisma.package.deleteMany();
  console.log("🧹 Cleared existing packages.");

  for (const plan of plans) {
    console.log(`\n📦 Setting up package: ${plan.name}`);

    console.log("   -> Creating Monthly Plan on Razorpay...");
    const rzpMonthly = await rzp.plans.create({
      period: 'monthly',
      interval: 1,
      item: { name: `${plan.name} - Monthly`, amount: plan.pricing.MONTHLY * 100, currency: 'INR' }
    });

    console.log("   -> Creating Quarterly Plan on Razorpay...");
    const rzpQuarterly = await rzp.plans.create({
      period: 'monthly',
      interval: 3,
      item: { name: `${plan.name} - Quarterly`, amount: plan.pricing.QUARTERLY * 100 * 3, currency: 'INR' }
    });

    console.log("   -> Creating Yearly Plan on Razorpay...");
    const rzpYearly = await rzp.plans.create({
      period: 'yearly',
      interval: 1,
      item: { name: `${plan.name} - Yearly`, amount: plan.pricing.YEARLY * 100 * 12, currency: 'INR' }
    });

    const dbPackage = await prisma.package.create({
      data: {
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.pricing.MONTHLY,
        quarterlyPrice: plan.pricing.QUARTERLY,
        yearlyPrice: plan.pricing.YEARLY,
        currency: 'INR',
        razorpayMonthlyPlanId: rzpMonthly.id,
        razorpayQuarterlyPlanId: rzpQuarterly.id,
        razorpayYearlyPlanId: rzpYearly.id,
        features: plan.features,
        ...plan.limits
      }
    });

    console.log(`   ✅ Saved to Database! IDs:`);
    console.log(`      Monthly: ${rzpMonthly.id}`);
    console.log(`      Quarterly: ${rzpQuarterly.id}`);
    console.log(`      Yearly: ${rzpYearly.id}`);
  }

  console.log("\n🎉 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
