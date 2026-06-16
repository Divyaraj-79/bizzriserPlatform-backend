const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const accountId = 'a0a1904d-616a-41b5-bf19-a3e1ee9760f7';
  const organizationId = '2d672d52-30df-484b-bd07-650ba09f22a6';
  const data = {
    messages: [{
      id: 'test_fake_msg_id_' + Date.now(),
      from: '919909553333',
      type: 'text',
      text: { body: 'Test manual run' },
      timestamp: String(Math.floor(Date.now() / 1000))
    }]
  };

  const from = data.messages[0].from;
  const existingContact = await prisma.contact.findUnique({
    where: { organizationId_phone: { organizationId, phone: from } }
  });
  console.log('Contact:', existingContact?.id);

  const recipientCampaign = await prisma.campaignRecipient.findFirst({
    where: {
      contactId: existingContact.id,
      firstResponse: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log('RecipientCampaign found:', recipientCampaign?.id);

  if (recipientCampaign) {
    const updated = await prisma.campaignRecipient.update({
      where: { id: recipientCampaign.id },
      data: {
        firstResponse: 'Test manual run',
        firstResponseAt: new Date(),
      },
    });
    console.log('Updated:', updated.firstResponse);
  }
}

main().catch(console.error);
