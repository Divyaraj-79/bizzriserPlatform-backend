import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

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
    try {
      // Deduplicate within the incoming batch (last one wins)
      const uniqueMap = new Map();
      contacts.forEach(c => {
        if (c.phone) {
          const cleanPhone = String(c.phone).replace(/\D/g, '');
          uniqueMap.set(cleanPhone, { ...c, phone: cleanPhone });
        }
      });

      const uniqueContacts = Array.from(uniqueMap.values());
      
      // Add to background queue with industrial reliability settings
      const job = await this.importQueue.add('import-contacts', {
        orgId,
        contacts: uniqueContacts,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      return {
        jobId: job.id,
        totalContacts: contacts.length,
        uniqueContacts: uniqueContacts.length,
        status: 'QUEUED'
      };
    } catch (err) {
      this.logger.error(`Failed to queue bulk import: ${err.message}`, err.stack);
      throw err;
    }
  }

  private escapeSql(val: any) {
    if (val === null || val === undefined) return '';
    return String(val).replace(/'/g, "''");
  }

  /**
   * Atomic Bulk Import using Raw SQL for maximum performance (100k+ records)
   * Ensures 'all or nothing' via a single database transaction.
   */
  async atomicBulkImport(orgId: string, contacts: any[], onProgress?: (p: number) => void) {
    const CHUNK_SIZE = 1000;
    const total = contacts.length;

    try {
      // Use a single transaction for the entire process to satisfy the "all or nothing" requirement
      return await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = contacts.slice(i, i + CHUNK_SIZE);
          
          const values = chunk.map(c => {
            const id = uuidv4();
            const customFields = JSON.stringify(c.customFields || {});
            return `('${id}', '${orgId}', '${this.escapeSql(c.phone)}', '${this.escapeSql(c.firstName)}', '${this.escapeSql(c.lastName)}', '${this.escapeSql(c.email)}', '${this.escapeSql(customFields)}'::jsonb, NOW(), NOW())`;
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
        timeout: 600000 // 10 minutes timeout for very large transactions
      });
    } catch (error) {
      this.logger.error(`Atomic bulk import failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getImportStatus(jobId: string) {
    const job = await this.importQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Import job not found');
    
    const state = await job.getState();
    const progress = job.progress || 0;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    // Normalize status for UI
    let status = state.toUpperCase();
    if (status === 'WAITING' || status === 'DELAYED') status = 'QUEUED';
    if (status === 'COMPLETED') status = 'COMPLETED';

    return {
      id: jobId,
      status,
      progress: typeof progress === 'number' ? progress : 0,
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
