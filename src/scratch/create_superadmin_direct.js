const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Manually load env variables
const dotenvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(dotenvPath)) {
  const envConfig = fs.readFileSync(dotenvPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (matched) {
      const key = matched[1];
      let value = matched[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.length > 0 && value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  }
}

const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Get orgId
    const org = await prisma.organization.findUnique({
      where: { slug: 'bizzriser' }
    });

    if (!org) {
      console.error('Error: Organization with slug "bizzriser" not found.');
      return;
    }

    const newSuperAdminHash = await bcrypt.hash('BizzRiser@79', 10);

    const user = await prisma.user.upsert({
      where: { email: 'divyarajmakwanabusiness@gmail.com' },
      update: {
        role: 'SUPER_ADMIN',
        passwordHash: newSuperAdminHash
      },
      create: {
        email: 'divyarajmakwanabusiness@gmail.com',
        passwordHash: newSuperAdminHash,
        firstName: 'Divyaraj',
        lastName: 'Makwana',
        role: 'SUPER_ADMIN',
        organizationId: org.id
      }
    });

    console.log(`Successfully created/updated superadmin: ${user.email} (ID: ${user.id})`);
  } catch (error) {
    console.error('Error in create_superadmin_direct:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
