const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { organizationId: '17d2b493-87b0-4671-aa19-2ca72e64eb38' }
  });
  
  if (!user) return console.log('User not found');
  
  require('dotenv').config();
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ sub: user.id, orgId: user.organizationId }, process.env.JWT_SECRET);
  
  try {
    const res = await axios.get('http://localhost:3001/api/v1/meta-commerce/settings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("STATUS:", res.status);
    console.log("RESPONSE DATA:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
main().finally(() => prisma.$disconnect());
