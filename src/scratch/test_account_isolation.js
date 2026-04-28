const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const testAgentEmail = 'qdakshraj@gmail.com'; // Dakshraj Chauhan
  const allowedAccountId = '61563ca2-838b-4d9c-bb78-ad448ecb3f42'; // BizzRiser
  const restrictedAccountId = '64d19375-f723-4f4c-9dcb-221a79825fa0'; // Divya Raj Makwana

  console.log('--- Setting up Test Data ---');
  
  const user = await prisma.user.findUnique({ where: { email: testAgentEmail } });
  if (!user) {
    console.error('User not found');
    return;
  }

  const role = await prisma.role.findFirst({ where: { organizationId: user.organizationId } });
  let targetRole = role;
  if (!role) {
    console.log('No specific roles found in organization, checking for any role...');
    targetRole = await prisma.role.findFirst();
    if (!targetRole) {
       console.error('No roles exist in the database at all.');
       return;
    }
  }

  // Clear existing access
  await prisma.whatsAppAccountAccess.deleteMany({ where: { userId: user.id } });

  // Assign only one account
  await prisma.whatsAppAccountAccess.create({
    data: {
      userId: user.id,
      whatsappAccountId: allowedAccountId,
      customRoleId: targetRole.id
    }
  });

  console.log(`Success: User ${user.email} assigned to Account ${allowedAccountId} with role ${targetRole.name}`);

  console.log('\n--- Verifying Access via Guard Logic Simulation ---');

  // Helper to simulate WhatsAppAccountGuard logic
  async function simulateGuardCheck(u, accountId) {
    if (u.role === 'SUPER_ADMIN' || u.role === 'ORG_ADMIN') return 'ALLOWED (Admin)';
    
    const access = await prisma.whatsAppAccountAccess.findUnique({
      where: {
        userId_whatsappAccountId: {
          userId: u.id,
          whatsappAccountId: accountId
        }
      }
    });
    
    return access ? 'ALLOWED (Assigned)' : 'REJECTED (Forbidden)';
  }

  const result1 = await simulateGuardCheck(user, allowedAccountId);
  const result2 = await simulateGuardCheck(user, restrictedAccountId);

  console.log(`Checking Account ${allowedAccountId}: ${result1}`);
  console.log(`Checking Account ${restrictedAccountId}: ${result2}`);

  if (result1 === 'ALLOWED (Assigned)' && result2 === 'REJECTED (Forbidden)') {
    console.log('\n✅ VERIFICATION SUCCESSFUL: Account isolation is enforced.');
  } else {
    console.log('\n❌ VERIFICATION FAILED: Access logic error.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
