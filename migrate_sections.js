const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting data migration to fix conversation sections...');
  
  // Find all conversations
  const conversations = await prisma.conversation.findMany({
    include: {
      messages: {
        select: {
          direction: true,
          metadata: true,
          type: true
        }
      }
    }
  });

  let broadcastCount = 0;
  let primaryCount = 0;

  for (const conv of conversations) {
    let isPrimary = false;
    
    // If conversation has no messages, we leave it PRIMARY or maybe BROADCAST? 
    // Let's check messages.
    if (conv.messages.length === 0) {
       // if no messages, it's probably a manual draft, leave as primary
       isPrimary = true;
    } else {
       for (const msg of conv.messages) {
         // If there's an inbound message, it's definitely PRIMARY
         if (msg.direction === 'INBOUND') {
           isPrimary = true;
           break;
         }
         // If there's an outbound message that is NOT a broadcast (i.e. no campaignId in metadata)
         const metadata = msg.metadata || {};
         if (msg.direction === 'OUTBOUND' && !metadata.campaignId) {
           isPrimary = true;
           break;
         }
       }
    }

    const targetSection = isPrimary ? 'PRIMARY' : 'BROADCAST';
    
    if (conv.section !== targetSection) {
       await prisma.conversation.update({
         where: { id: conv.id },
         data: { section: targetSection }
       });
       if (targetSection === 'BROADCAST') broadcastCount++;
       else primaryCount++;
    } else {
       if (targetSection === 'BROADCAST') broadcastCount++;
       else primaryCount++;
    }
  }

  console.log(`Migration complete. Primary: ${primaryCount}, Broadcast: ${broadcastCount}`);
}

main()
  .catch(console.error)
  .finally(() => {
    prisma.$disconnect();
  });
