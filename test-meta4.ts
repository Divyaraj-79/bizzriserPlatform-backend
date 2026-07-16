import { PrismaClient } from '@prisma/client';
import axios from 'axios';

async function test() {
  const prisma = new PrismaClient();
  try {
    const conn = await prisma.metaCommerceConnection.findFirst();
    if (!conn) return;

    console.log('Fetching WABAs...');
    const wabaRes = await axios.get('https://graph.facebook.com/v19.0/me/whatsapp_business_accounts', {
      params: { access_token: conn.accessToken }
    });
    console.log('WABAs:', JSON.stringify(wabaRes.data.data, null, 2));

    for (const waba of wabaRes.data.data) {
      console.log('Fetching catalogs for WABA:', waba.id);
      try {
        const catRes = await axios.get(`https://graph.facebook.com/v19.0/${waba.id}/product_catalogs`, {
          params: { access_token: conn.accessToken }
        });
        console.log('Catalogs:', JSON.stringify(catRes.data.data, null, 2));
      } catch (e: any) {
        console.error('Catalog Error:', e.response?.data || e.message);
      }
    }
  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test().catch(console.error);
