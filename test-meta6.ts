import { PrismaClient } from '@prisma/client';
import axios from 'axios';

async function test() {
  const prisma = new PrismaClient();
  try {
    const conn = await prisma.metaCommerceConnection.findFirst();
    if (!conn) return;

    const catalogId = '1969882530083590';
    const retailerId = 'test_' + Date.now();

    const data = {
      title: 'Test Product ' + Date.now(),
      description: 'Testing',
      price: '5999 INR', // combined price and currency!
      image_url: 'https://picsum.photos/200/300.jpg',
      url: 'https://example.com/product',
      brand: 'Test Brand',
      availability: 'in stock',
      condition: 'new',
      id: retailerId
    };

    const payload = {
      item_type: 'PRODUCT_ITEM',
      requests: [
        {
          method: 'CREATE',
          data: data
        }
      ]
    };
    
    console.log('Sending payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(`https://graph.facebook.com/v19.0/${catalogId}/items_batch`, payload, {
      params: { access_token: conn.accessToken },
    });
    console.log('Success Response:', JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test().catch(console.error);
