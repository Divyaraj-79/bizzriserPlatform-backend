import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('contact-import') private readonly importQueue: Queue,
  ) {}

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
    // Deduplicate within the incoming batch (last one wins)
    const uniqueMap = new Map();
    contacts.forEach(c => {
      if (c.phone) {
        // Ensure phone is a string and cleaned
        const cleanPhone = String(c.phone).replace(/\D/g, '');
        uniqueMap.set(cleanPhone, { ...c, phone: cleanPhone });
      }
    });

    const uniqueContacts = Array.from(uniqueMap.values());
    
    // Add to background queue instead of processing synchronously
    const job = await this.importQueue.add('import-contacts', {
      orgId,
      contacts: uniqueContacts,
    });

    return {
      jobId: job.id,
      totalContacts: contacts.length,
      uniqueContacts: uniqueContacts.length,
      status: 'QUEUED'
    };
  }

  /**
   * Atomic Bulk Import using Raw SQL for maximum performance (100k+ records)
   * Ensures 'all or nothing' via a single database transaction.
   */
  async atomicBulkImport(orgId: string, contacts: any[], onProgress?: (p: number) => void) {
    const CHUNK_SIZE = 1000;
    const total = contacts.length;

    // Use a single transaction for the entire process to satisfy the "all or nothing" requirement
    return this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = contacts.slice(i, i + CHUNK_SIZE);
        
        // Construct bulk SQL
        // PostgreSQL ON CONFLICT DO UPDATE
        const values = chunk.map(c => {
          const id = uuidv4();
          const customFields = JSON.stringify(c.customFields || {});
          return `('${id}', '${orgId}', '${c.phone}', '${c.firstName || ''}', '${c.lastName || ''}', '${c.email || ''}', '${customFields}'::jsonb, NOW(), NOW())`;
        }).join(',');

        const query = `
          INSERT INTO "contacts" ("id", "organizationId", "phone", "firstName", "lastName", "email", "customFields", "createdAt", "updatedAt")
          VALUES ${values}
          ON CONFLICT ("organizationId", "phone") DO UPDATE SET
            "firstName" = EXCLUDED."firstName",
            "lastName" = EXCLUDED."lastName",
            "email" = EXCLUDED."email",
            "customFields" = EXCLUDED."customFields",
            "updatedAt" = NOW();
        `;

        await tx.$executeRawUnsafe(query);

        if (onProgress) {
          onProgress(Math.min(100, Math.floor(((i + chunk.length) / total) * 100)));
        }
      }
    }, {
      timeout: 300000 // 5 minutes timeout for the entire 100k transaction
    });
  }

  async getImportStatus(jobId: string) {
    const job = await this.importQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Import job not found');
    
    const status = await job.getState();
    const progress = job.progress();
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: jobId,
      status: status.toUpperCase(),
      progress,
      result,
      error: failedReason
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
