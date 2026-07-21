const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const org = await prisma.organization.findFirst();
  const conn = await prisma.metaCommerceConnection.findFirst({ where: { organizationId: org.id } });
  
  if (!conn) return;

  const product = await prisma.metaProduct.findFirst({ where: { organizationId: org.id } });
  if (!product) return;
  
  console.log("Hiding product", product.retailerId);
  const payload = {
    item_type: 'PRODUCT_ITEM',
    requests: [
      {
        method: 'UPDATE',
        data: { id: product.retailerId, visibility: 'staging' }
      }
    ]
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v20.0/${product.metaCatalogId}/items_batch`, payload, {
      params: { access_token: conn.accessToken }
    });
    console.log("Response visibility:", JSON.stringify(response.data, null, 2));
    
    console.log("\nSetting availability to out of stock...");
    const payload2 = {
      item_type: 'PRODUCT_ITEM',
      requests: [
        {
          method: 'UPDATE',
          data: { id: product.retailerId, availability: 'out of stock' }
        }
      ]
    };
    const response2 = await axios.post(`https://graph.facebook.com/v20.0/${product.metaCatalogId}/items_batch`, payload2, {
      params: { access_token: conn.accessToken }
    });
    console.log("Response availability:", JSON.stringify(response2.data, null, 2));
  } catch (err) {
    console.log("Error:", err.response ? err.response.data : err.message);
  }
}
test();
