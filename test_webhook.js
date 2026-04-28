const crypto = require('crypto');
const axios = require('axios');

async function testWebhook() {
  const secret = '13c7d7485764339d9b50b2ab8794d387'; // From .env
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '123', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1092037970652838' }, messages: [{ from: '123', text: { body: 'Test' } }] } }] }]
  });

  const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  try {
    const res = await axios.post('https://bizzriserplatform-backend.onrender.com/api/v1/webhook', payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`
      }
    });
    console.log('Success:', res.status);
  } catch (err) {
    console.error('Error:', err.response?.status, err.response?.data);
  }
}

testWebhook();
