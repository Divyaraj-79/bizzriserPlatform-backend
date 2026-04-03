import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdate(orgId: string, phone: string, data: any) {
    return this.prisma.contact.upsert({
      where: { organizationId_phone: { organizationId: orgId, phone } },
      update: data,
      create: { ...data, organizationId: orgId, phone },
    });
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
