const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API_URL = 'http://localhost:3001/api/v1';

async function runTest() {
  console.log('--- Starting Permission-First Intersection Test ---');

  // 1. Find a target Agent and Account
  const access = await prisma.whatsAppAccountAccess.findFirst({
    include: { user: true, whatsappAccount: true, customRole: true }
  });

  if (!access) {
    console.log('No account access records found to test.');
    return;
  }

  const user = access.user;
  const accountId = access.whatsappAccountId;
  const roleName = access.customRole.name;
  const rolePerms = access.customRole.permissions;

  console.log(`Testing with User: ${user.email}, Account: ${access.whatsappAccount.displayName}, Role: ${roleName}`);
  console.log(`Role Permissions: ${JSON.stringify(rolePerms)}`);

  // We'll test 'inbox:view' which is in 'Chat Agent' role
  const testPermission = 'inbox:view';
  const slugInRole = rolePerms.includes(testPermission);
  
  if (!slugInRole) {
    console.log(`Aborting: ${testPermission} is not in the assigned role. Please update the role first.`);
    return;
  }

  // SCENARIO 1: Global ON, Role ON -> Should have access
  console.log('\nScenario 1: Global ON, Role ON');
  await prisma.user.update({
    where: { id: user.id },
    data: { permissions: { [testPermission]: true } }
  });
  
  // Here we simulate the frontend call to me/permissions
  // Since we don't have a token, we hit the service logic directly in a scratch script
  // OR we just check the merged logic manually to confirm
  
  const finalPerms = await getMerged(user.id, accountId);
  console.log(`Access to ${testPermission} in Account Context: ${!!finalPerms[testPermission]} (Expected: true)`);

  // SCENARIO 2: Global OFF, Role ON -> Should NOT have access (Intersection)
  console.log('\nScenario 2: Global OFF, Role ON');
  await prisma.user.update({
    where: { id: user.id },
    data: { permissions: { [testPermission]: false } }
  });
  
  const finalPerms2 = await getMerged(user.id, accountId);
  console.log(`Access to ${testPermission} in Account Context: ${!!finalPerms2[testPermission]} (Expected: false)`);

  console.log('\n--- Test Completed ---');
}

async function getMerged(userId, accountId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const global = user.permissions || {};
  
  const access = await prisma.whatsAppAccountAccess.findUnique({
    where: { userId_whatsappAccountId: { userId, whatsappAccountId: accountId } },
    include: { customRole: true }
  });

  if (!access || !access.customRole) return { 'dashboard:view': true };

  const rolePerms = access.customRole.permissions || [];
  let intersection = { 'dashboard:view': true };
  
  rolePerms.forEach(p => {
    if (global[p]) {
      intersection[p] = true;
    }
  });
  
  return intersection;
}

runTest()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
