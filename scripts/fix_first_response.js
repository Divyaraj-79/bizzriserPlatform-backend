const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting retroactive first response fix...');
  
  // Find the 'Limit Increase Broadcast' campaign
  const campaign = await prisma.campaign.findFirst({
    where: { name: 'Limit Increase Broadcast' },
    orderBy: { createdAt: 'desc' }
  });

  if (!campaign) {
    console.log('Campaign not found.');
    return;
  }
  console.log(`Found campaign: ${campaign.id}`);

  // Find all inbound messages after the broadcast was created
  const inboundMsgs = await prisma.message.findMany({
    where: { 
      direction: 'INBOUND', 
      createdAt: { gte: campaign.createdAt } 
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Found ${inboundMsgs.length} inbound messages after broadcast creation.`);

  let updatedCount = 0;
  const processedContactIds = new Set();

  for (const msg of inboundMsgs) {
    if (processedContactIds.has(msg.contactId)) continue;

    // Find the campaign recipient for this contact
    const recipient = await prisma.campaignRecipient.findFirst({
      where: {
        campaignId: campaign.id,
        contactId: msg.contactId,
        firstResponse: null
      }
    });

    if (recipient) {
      let textBody = '';
      if (msg.type === 'TEXT') {
        textBody = msg.content?.body || '';
      } else if (msg.type === 'AUDIO') {
        textBody = '[Audio]';
      } else {
        textBody = `[${msg.type}]`;
      }

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          firstResponse: textBody || '[Empty Message]',
          firstResponseAt: msg.createdAt
        }
      });
      console.log(`Updated contact ${msg.contactId} with first response.`);
      updatedCount++;
    }
    
    processedContactIds.add(msg.contactId);
  }

  // Recalculate campaign response count atomically
  const totalResponses = await prisma.campaignRecipient.count({
    where: {
      campaignId: campaign.id,
      firstResponse: { not: null }
    }
  });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { responseCount: totalResponses }
  });

  console.log(`Finished. Updated ${updatedCount} recipients. New campaign response count: ${totalResponses}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
