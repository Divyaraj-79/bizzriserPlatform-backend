import { PrismaClient } from '@prisma/client';
import axios from 'axios';

async function test() {
  const prisma = new PrismaClient();
  try {
    const conn = await prisma.metaCommerceConnection.findFirst();
    if (!conn) { console.log('No connection'); return; }
    
    console.log('Got connection for org:', conn.organizationId);
    const bRes = await axios.get('https://graph.facebook.com/v19.0/me/businesses', {
      params: { access_token: conn.accessToken }
    });
    const businessId = bRes.data.data[0].id;
    console.log('Business ID:', businessId);
    
    try {
      const cRes = await axios.get('https://graph.facebook.com/v19.0/' + businessId + '/owned_product_catalogs', {
        params: { access_token: conn.accessToken }
      });
      console.log('Owned Catalogs:', cRes.data.data);
    } catch (e: any) {
      console.error('Owned Error:', e.response?.data || e.message);
      
      try {
        const cRes2 = await axios.get('https://graph.facebook.com/v19.0/' + businessId + '/client_product_catalogs', {
          params: { access_token: conn.accessToken }
        });
        console.log('Client Catalogs:', cRes2.data.data);
      } catch (e2: any) {
        console.error('Client Error:', e2.response?.data || e2.message);
      }
    }
  } catch (e: any) {
      console.error('Business Error:', e.response?.data || e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test().catch(console.error);
