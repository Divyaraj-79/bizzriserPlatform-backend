const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting campaign reply backfill...');
  
  // Find all campaign recipients where firstResponse is null
  const recipients = await prisma.campaignRecipient.findMany({
    where: { firstResponse: null },
    include: { contact: true, campaign: true }
  });
  
  console.log(`Found ${recipients.length} recipients without a recorded response.`);
  
  let updatedCount = 0;
  for (const r of recipients) {
    // Find the first inbound message from this contact created after the campaign recipient record was created (or within 24 hours)
    const inboundMessage = await prisma.message.findFirst({
      where: {
        contactId: r.contactId,
        direction: 'INBOUND',
        createdAt: { gte: r.createdAt } // received after campaign was dispatched
      },
      orderBy: { createdAt: 'asc' }
    });
    
    if (inboundMessage) {
      console.log(`Matching reply for ${r.contact.firstName} (${r.contact.phone}):`);
      console.log(`  - Campaign: ${r.campaign.name}`);
      console.log(`  - Inbound Message Body: "${inboundMessage.content?.body || '[Media/Interactive Reply]'}"`);
      
      const textBody = inboundMessage.content?.body || '[Media/Interactive Reply]';
      
      // Update campaign recipient record
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: {
          firstResponse: textBody,
          firstResponseAt: inboundMessage.createdAt
        }
      });
      
      // Recalculate campaign responseCount
      const stats = await prisma.campaignRecipient.count({
        where: {
          campaignId: r.campaignId,
          firstResponse: { not: null }
        }
      });
      
      await prisma.campaign.update({
        where: { id: r.campaignId },
        data: { responseCount: stats }
      });
      
      console.log(`  -> Successfully backfilled response!`);
      updatedCount++;
    }
  }
  
  console.log(`Backfill complete. Updated ${updatedCount} recipient records.`);
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
