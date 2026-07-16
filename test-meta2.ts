import { PrismaClient } from '@prisma/client';
import axios from 'axios';

async function test() {
  const prisma = new PrismaClient();
  try {
    const conn = await prisma.metaCommerceConnection.findFirst();
    if (!conn) return;
    const res = await axios.get('https://graph.facebook.com/v19.0/me/product_catalogs', {
      params: { access_token: conn.accessToken }
    });
    console.log('Me Catalogs:', res.data.data);
  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test().catch(console.error);
