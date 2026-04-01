const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function updateSuperAdmin() {
  try {
    const password = 'BizzRiser@79';
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    // Find Super Admin
    const user = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' }
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash }
      });
      console.log(`Updated Super Admin password for: ${user.email}`);
    } else {
      console.log('No Super Admin found.');
    }
  } catch (error) {
    console.error('Error updating Super Admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateSuperAdmin();
