const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { WhatsAppService } = require('./dist/src/modules/whatsapp/whatsapp.service');
const { EncryptionService } = require('./dist/src/modules/encryption/encryption.service');
const { ConfigService } = require('@nestjs/config');

async function testSend() {
  const account = await prisma.whatsAppAccount.findFirst();
  if (!account) return console.log('No account found');

  const configService = new ConfigService();
  const encryptionService = new EncryptionService(configService);
  const whatsappService = new WhatsAppService(prisma, encryptionService, configService, null, null);

  const mediaId = '1040260498330125'; // From the latest 'wef' campaign

  const payload = {
    messaging_product: 'whatsapp',
    to: account.phoneNumber, // Sending to themselves
    type: 'template',
    template: {
      name: 'alert_reminder_0123323',
      language: { code: 'en' }, 
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { id: mediaId }
            }
          ]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'wef' },
            { type: 'text', text: 'wefwe' },
            { type: 'text', text: 'wEFw' }
          ]
        }
      ]
    }
  };

  try {
    const { token } = await whatsappService.getValidToken(account);
    const axios = require('axios');
    const res = await axios.post(
      `https://graph.facebook.com/v20.0/${account.phoneNumberId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Success:', res.data);
  } catch (err) {
    console.log('Error:', err.response?.data || err.message);
  }
}
testSend().finally(() => prisma.$disconnect());
