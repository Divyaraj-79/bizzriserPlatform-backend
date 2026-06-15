const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting contact merge script...');
  const contacts = await prisma.contact.findMany();
  
  // Find contacts with exactly 10 digits
  const shortContacts = contacts.filter(c => c.phone && c.phone.length === 10);
  
  let mergedCount = 0;

  for (const shortContact of shortContacts) {
    const longPhone = '91' + shortContact.phone;
    
    // Check if a long version exists
    const longContact = contacts.find(c => c.phone === longPhone && c.organizationId === shortContact.organizationId);
    
    if (longContact) {
      console.log(`Merging ${shortContact.phone} -> ${longContact.phone}`);
      
      // Update Messages
      await prisma.message.updateMany({
        where: { contactId: shortContact.id },
        data: { contactId: longContact.id }
      });
      
      // We also need to update Conversation
      // First, get the conversation of the short contact
      const shortConv = await prisma.conversation.findFirst({
        where: { contactId: shortContact.id }
      });
      
      const longConv = await prisma.conversation.findFirst({
        where: { contactId: longContact.id }
      });

      if (shortConv && longConv) {
        // Move all messages from shortConv to longConv
        await prisma.message.updateMany({
          where: { conversationId: shortConv.id },
          data: { conversationId: longConv.id }
        });
        
        // Update longConv last message stats if shortConv is newer
        if (shortConv.lastMessageAt > longConv.lastMessageAt) {
          await prisma.conversation.update({
            where: { id: longConv.id },
            data: { 
              lastMessageAt: shortConv.lastMessageAt,
              lastMessageBody: shortConv.lastMessageBody,
              section: 'PRIMARY' // If it had a reply, it should be primary
            }
          });
        }
        
        // Delete shortConv
        await prisma.conversation.delete({ where: { id: shortConv.id } });
      } else if (shortConv && !longConv) {
        // Just point the shortConv to the longContact
        await prisma.conversation.update({
          where: { id: shortConv.id },
          data: { contactId: longContact.id }
        });
      }

      // Update Campaign Recipients
      await prisma.campaignRecipient.updateMany({
        where: { contactId: shortContact.id },
        data: { contactId: longContact.id }
      });

      // Update Chatbot Sessions
      await prisma.chatbotSession.updateMany({
        where: { contactId: shortContact.id },
        data: { contactId: longContact.id }
      });
      
      // Merge Tags
      const mergedTags = [...new Set([...longContact.tags, ...shortContact.tags])];
      await prisma.contact.update({
        where: { id: longContact.id },
        data: { tags: mergedTags }
      });

      // Finally delete the short contact
      await prisma.contact.delete({
        where: { id: shortContact.id }
      });
      
      mergedCount++;
    } else {
      // If long version doesn't exist, just update this contact's phone to have 91
      console.log(`Upgrading ${shortContact.phone} -> ${longPhone} (No duplicate)`);
      try {
        await prisma.contact.update({
          where: { id: shortContact.id },
          data: { phone: longPhone }
        });
        
        // Note: we don't need to touch conversation or messages here because 
        // they are already linked to this contact ID
      } catch (err) {
        console.error(`Failed to upgrade ${shortContact.phone}:`, err.message);
      }
    }
  }

  console.log(`Script finished. Merged ${mergedCount} contacts.`);
}

main().finally(() => {
  prisma.$disconnect();
});
