const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Run this script whenever you update the Pricing amounts of your Packages in the database!
 * 
 * Razorpay Plans are immutable. This means if you change a package price, the old Razorpay Plan ID 
 * cannot be updated with the new price. 
 * 
 * By nullifying the plan IDs in your database using this script, the backend will automatically 
 * create NEW Razorpay plans with the updated pricing the next time a client tries to checkout!
 */
async function resetPlanIds() {
  console.log('Resetting Razorpay Plan IDs...');
  
  const result = await prisma.package.updateMany({
    data: {
      razorpayQuarterlyPlanId: null,
      razorpayYearlyPlanId: null
    }
  });

  console.log(`Successfully cleared Razorpay Plan IDs for ${result.count} packages.`);
  console.log('New plans will be generated automatically on checkout!');
}

resetPlanIds()
  .then(() => process.exit(0))
  .catch(e => { 
    console.error(e); 
    process.exit(1); 
  });
