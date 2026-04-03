import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdate(orgId: string, phone: string, data: any) {
    const { tags, ...rest } = data;
    return this.prisma.contact.upsert({
      where: { organizationId_phone: { organizationId: orgId, phone } },
      update: {
        ...rest,
        tags: tags ? { set: tags } : undefined,
      },
      create: {
        ...rest,
        tags: tags || [],
        organizationId: orgId,
        phone,
      },
    });
  }

  async bulkCreateOrUpdate(orgId: string, contacts: any[]) {
    // 1. Deduplicate within the incoming batch (last one wins)
    const uniqueMap = new Map();
    contacts.forEach(c => {
      if (c.phone) uniqueMap.set(c.phone, c);
    });

    const uniqueContacts = Array.from(uniqueMap.values());
    const results = [];

    // 2. Process each unique contact (upsert)
    for (const contact of uniqueContacts) {
      try {
        const res = await this.createOrUpdate(orgId, contact.phone, contact);
        results.push(res);
      } catch (err) {
        console.error(`Failed to import contact ${contact.phone}:`, err);
      }
    }

    return {
      totalProcessed: uniqueContacts.length,
      importedCount: results.length,
      duplicatesRemoved: contacts.length - uniqueContacts.length
    };
  }

  async findAll(orgId: string) {
    return this.prisma.contact.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getTagsAnalytics(orgId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId: orgId },
      select: { tags: true }
    });

    const tagCounts: Record<string, number> = {};
    contacts.forEach(c => {
      c.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts).map(([name, count]) => ({ name, count }));
  }

  async bulkAddTags(orgId: string, contactIds: string[], tags: string[]) {
    // Prisma array updates are specific per element. We'll iterate for safety or use raw SQL.
    // For local dev, we'll iterate.
    const promises = contactIds.map(async (id) => {
       const contact = await this.prisma.contact.findUnique({ where: { id } });
       if (!contact) return;
       const newTags = Array.from(new Set([...contact.tags, ...tags]));
       return this.prisma.contact.update({
          where: { id },
          data: { tags: newTags }
       });
    });
    return Promise.all(promises);
  }

  async bulkRemoveTags(orgId: string, contactIds: string[], tags: string[]) {
    const promises = contactIds.map(async (id) => {
       const contact = await this.prisma.contact.findUnique({ where: { id } });
       if (!contact) return;
       const newTags = contact.tags.filter(t => !tags.includes(t));
       return this.prisma.contact.update({
          where: { id },
          data: { tags: newTags }
       });
    });
    return Promise.all(promises);
  }

  async deleteContacts(orgId: string, contactIds: string[]) {
     return this.prisma.contact.deleteMany({
        where: { id: { in: contactIds }, organizationId: orgId }
     });
  }
}
