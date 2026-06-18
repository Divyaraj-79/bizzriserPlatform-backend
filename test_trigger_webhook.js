const axios = require('axios');

async function main() {
  console.log('Triggering webhook on localhost:3001...');
  
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7', // whatsappAccountId
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7'
              },
              contacts: [
                {
                  profile: { name: 'Test' },
                  wa_id: '916353239919'
                }
              ],
              messages: [
                {
                  from: '916353239919',
                  id: 'wamid.test_' + Date.now(),
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: 'start' },
                  type: 'text'
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  const crypto = require('crypto');
  const secret = '13c7d7485764339d9b50b2ab8794d387';
  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

  try {
    const res = await axios.post('http://localhost:3001/api/v1/webhook', payload, {
      headers: {
        'X-Hub-Signature-256': `sha256=${signature}`
      }
    });
    console.log('Webhook response:', res.status, res.data);
  } catch (err) {
    console.error('Webhook request failed:', err.response?.data || err.message);
  }
}

main();
