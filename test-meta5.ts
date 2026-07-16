import { PrismaClient } from '@prisma/client';
import axios from 'axios';

async function test() {
  const prisma = new PrismaClient();
  try {
    const conn = await prisma.metaCommerceConnection.findFirst();
    if (!conn) return;

    const bRes = await axios.get('https://graph.facebook.com/v19.0/me/businesses', {
      params: { access_token: conn.accessToken }
    });
    const businesses = bRes.data.data;
    console.log(`Found ${businesses.length} businesses.`);
    
    for (const b of businesses) {
      console.log(`Testing business: ${b.name} (${b.id})`);
      try {
        const cRes = await axios.get(`https://graph.facebook.com/v19.0/${b.id}/owned_product_catalogs`, {
          params: { access_token: conn.accessToken }
        });
        console.log(`  Owned Catalogs:`, cRes.data.data);
      } catch (e: any) {
        console.error(`  Owned Error:`, e.response?.data?.error?.message || e.message);
      }
      try {
        const cRes2 = await axios.get(`https://graph.facebook.com/v19.0/${b.id}/client_product_catalogs`, {
          params: { access_token: conn.accessToken }
        });
        console.log(`  Client Catalogs:`, cRes2.data.data);
      } catch (e: any) {
        console.error(`  Client Error:`, e.response?.data?.error?.message || e.message);
      }
    }
  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test().catch(console.error);
