const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const testAgentEmail = 'qdakshraj@gmail.com'; // Dakshraj Chauhan
  const allowedAccountId = '61563ca2-838b-4d9c-bb78-ad448ecb3f42'; // BizzRiser

  console.log('--- Phase 3b: Permission Masking Verification ---');
  
  const user = await prisma.user.findUnique({ where: { email: testAgentEmail } });
  
  // Assigned Role has: ['dashboard:view', 'inbox:view', 'chatbots:view']
  // We want to verify that GET /me/permissions returns exactly these (plus any global ones)

  // Simulate UsersController.getMyPermissions logic
  async function simulateGetMyPermissions(u, accountId) {
    const userPermissions = u.permissions || {}; // Global permissions from JWT/User
    let mergedPermissions = { ...userPermissions };

    if (accountId && u.role === 'AGENT') {
      const access = await prisma.whatsAppAccountAccess.findUnique({
        where: { userId_whatsappAccountId: { userId: u.id, whatsappAccountId: accountId } },
        include: { customRole: true }
      });
      if (access?.customRole) {
        const rolePermissions = access.customRole.permissions || [];
        rolePermissions.forEach(p => {
          mergedPermissions[p] = true;
        });
      }
    }
    return mergedPermissions;
  }

  const permissions = await simulateGetMyPermissions(user, allowedAccountId);
  console.log('Final Calculated Permissions for Account:', JSON.stringify(permissions, null, 2));

  const hasChatbot = permissions['chatbots:view'];
  const hasBroadcast = permissions['campaigns:view'];

  console.log(`Has Chatbot Access: ${hasChatbot ? 'YES ✅' : 'NO ❌'}`);
  console.log(`Has Broadcast Access: ${hasBroadcast ? 'YES ❌' : 'NO ✅'}`);

  if (hasChatbot && !hasBroadcast) {
    console.log('\n✅ VERIFICATION SUCCESSFUL: Permission masking is working.');
  } else {
    console.log('\n❌ VERIFICATION FAILED: Permissions are leaked or missing.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
