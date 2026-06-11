const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');

async function main() {
  try {
    const anyContact = await prisma.contact.findFirst({ select: { organizationId: true } });
    if (!anyContact) return console.log('no contacts');
    const orgId = anyContact.organizationId;
    
    // Generate 25,000 UUIDs (need real IDs for contactId FK, so let's query them)
    const contacts = await prisma.contact.findMany({ select: { id: true }, take: 24836 });
    const finalContactIds = contacts.map(c => c.id);

    const campaignId = uuidv4();
    await prisma.campaign.create({
      data: {
        id: campaignId,
        organizationId: orgId,
        name: 'test-camp',
        templateName: 'temp',
        templateParams: [],
        status: 'DRAFT',
        totalRecipients: finalContactIds.length,
        metadata: {}
      }
    });

    console.time('insertUnnest');
    const unnestIds = finalContactIds.map(id => `'${id}'`).join(',');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "campaign_recipients" ("id", "campaignId", "contactId", "status", "createdAt")
      SELECT gen_random_uuid(), '${campaignId}', unnest(ARRAY[${unnestIds}]::text[]), 'PENDING', NOW()
    `);
    console.timeEnd('insertUnnest');

    const count = await prisma.campaignRecipient.count({ where: { campaignId } });
    console.log('Inserted Count:', count);

    // cleanup
    await prisma.campaignRecipient.deleteMany({ where: { campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } });

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
