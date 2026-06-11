import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('contact-import') private readonly importQueue: any,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private sanitizePhone(phone: any): string {
    if (!phone) return '';
    let clean = String(phone);
    if (clean.includes('E+') || clean.includes('e+')) {
      clean = Number(clean).toLocaleString('fullwide', { useGrouping: false });
    }
    return clean.replace(/\D/g, '');
  }

  async findOne(orgId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId: orgId },
      include: {
        notes: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          include: { chatbot: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        enrollments: {
          include: { sequence: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!contact) throw new NotFoundException('Contact not found');

    // 24-Hour Window Calculation (Meta Standards)
    const lastInbound = await this.prisma.message.findFirst({
      where: { contactId, direction: 'INBOUND' },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      select: { sentAt: true, createdAt: true },
    });

    const lastInboundTime = lastInbound?.sentAt || lastInbound?.createdAt;
    const windowExpiresAt = lastInboundTime
      ? new Date(lastInboundTime.getTime() + 24 * 60 * 60 * 1000)
      : null;
    const isInWindow = windowExpiresAt ? windowExpiresAt > new Date() : false;

    return {
      ...contact,
      windowExpiresAt,
      isInWindow,
    };
  }

  async uploadAvatar(orgId: string, contactId: string, file: any): Promise<{ avatarUrl: string }> {
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const updated = await this.prisma.contact.update({
      where: { id: contactId },
      data: { avatarUrl: base64 },
    });
    return { avatarUrl: updated.avatarUrl! };
  }

  async updateContact(orgId: string, contactId: string, data: any) {
    console.log('[ContactsService] updateContact request:', { orgId, contactId, data });
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.organizationId !== orgId) {
      console.error('[ContactsService] Contact not found or org mismatch:', { contactId, orgId });
      throw new NotFoundException('Contact not found');
    }
    
    // Only update specified fields
    const { firstName, lastName, email, phone, status, tags } = data;
    let cleanPhone = phone ? this.sanitizePhone(phone) : undefined;
    
    console.log('[ContactsService] Executing prisma update with data:', { firstName, lastName, email, cleanPhone, status, tags });
    
    const result = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(email !== undefined && { email }),
        ...(cleanPhone !== undefined && { phone: cleanPhone }),
        ...(status !== undefined && { status }),
        ...(tags !== undefined && { tags }),
        ...(data.customFields !== undefined && { customFields: data.customFields }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
      }
    });

    console.log('[ContactsService] update success:', result.id);
    this.realtimeGateway.emitContactUpdate(orgId, 'contact:updated', result);
    return result;
  }

  async createOrUpdate(orgId: string, phone: string, data: any) {
    this.logger.log(`[ENTRY] createOrUpdate called for Org: ${orgId}, Phone: ${phone}`);
    const cleanPhone = this.sanitizePhone(phone);
    
    // Destructure tags and other data from the input
    const { tags, ...otherData } = data || {};

    const baseData: any = {
      ...otherData,
      organizationId: orgId,
      phone: cleanPhone,
    };

    const result = await this.prisma.contact.upsert({
      where: {
        organizationId_phone: { organizationId: orgId, phone: cleanPhone },
      },
      update: {
        ...baseData,
        // Only update tags if they were explicitly provided in the data object
        ...(tags !== undefined ? { tags: { set: tags } } : {}),
      },
      create: {
        ...baseData,
        tags: tags || [],
        firstName: baseData.firstName || '',
        lastName: baseData.lastName || '',
      },
    });
    
    this.realtimeGateway.emitContactUpdate(orgId, 'contact:updated', result);
    return result;
  }

  async bulkCreateOrUpdate(orgId: string, contacts: any[]) {
    // Robust OrgID resolution
    const resolvedOrgId = orgId || 'GLOBAL';
    this.logger.log(`Bulk import request for Org: ${resolvedOrgId}, Count: ${contacts?.length}`);
    
    try {
      if (!contacts || !Array.isArray(contacts)) {
        throw new Error('Invalid contacts data provided');
      }
      // Deduplicate within the incoming batch (last one wins)
      const uniqueMap = new Map();
      contacts.forEach(c => {
        const phoneInput = c.phone || c.Phone || c.Number;
        if (phoneInput) {
          const cleanPhone = this.sanitizePhone(phoneInput);
          if (cleanPhone) {
            uniqueMap.set(cleanPhone, { 
              ...c, 
              phone: cleanPhone,
              firstName: c.name || c.Name || c.firstName || c.FirstName || ''
            });
          }
        }
      });

      const uniqueContacts = Array.from(uniqueMap.values());
      const uniqueCount = uniqueContacts.length;
      const duplicatesInFile = contacts.length - uniqueCount;

      // CROSS-CHECK WITH DATABASE: Identify how many already exist
      const existingInDb = await this.prisma.contact.findMany({
        where: {
          organizationId: orgId,
          phone: { in: uniqueContacts.map(c => c.phone) }
        },
        select: { phone: true }
      });

      const existingCount = existingInDb.length;
      const totalDuplicates = duplicatesInFile + existingCount;
      const trulyNewCount = uniqueCount - existingCount;
      
      this.logger.log(`Queueing ${uniqueCount} contacts for Org: ${resolvedOrgId}. Stats: New: ${trulyNewCount}, Existing: ${existingCount}, File-Duplicates: ${duplicatesInFile}`);

      // Add to background queue with industrial reliability settings
      const job = await this.importQueue.add('import-contacts', {
        orgId,
        contacts: uniqueContacts,
        originalCount: contacts.length,
        duplicatesRemoved: totalDuplicates, // Sum of file duplicates and existing DB records
        newCount: trulyNewCount,
        existingCount: existingCount
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 }, // Keep for 1 hour to allow polling
        removeOnFail: { age: 86400 },   // Keep failed for 24 hours
      });

      return {
        jobId: job.id,
        totalContacts: uniqueCount, 
        originalCount: contacts.length,
        duplicatesRemoved: totalDuplicates,
        newCount: trulyNewCount,
        status: 'QUEUED'
      };
    } catch (err: any) {
      this.logger.error(`Failed to queue bulk import: ${err.message}`, err.stack);
      throw err;
    }
  }

  private escapeSql(val: any) {
    if (val === null || val === undefined) return '';
    // Single quotes are escaped by doubling them in SQL
    // Backslashes are escaped to prevent breaking the string literal
    return String(val)
      .replace(/'/g, "''")
      .replace(/\\/g, "\\\\")
      .replace(/\0/g, ""); // Remove null bytes
  }


  /**
   * Atomic Bulk Import using Raw SQL for maximum performance (100k+ records)
   * Ensures 'all or nothing' via a single database transaction.
   */
  async atomicBulkImport(orgId: string, contacts: any[], onProgress?: (stats: { current: number, total: number }) => void) {
    const CHUNK_SIZE = 200; 
    const total = contacts.length;
    let processed = 0;

    try {
      // Use a single transaction to ensure 'All or Nothing' integrity
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = contacts.slice(i, i + CHUNK_SIZE);
          
          const values = chunk.map(c => {
            const id = uuidv4();
            // CRITICAL: Must sanitize phone to match DB unique constraint (digits only)
            const phone = this.escapeSql(this.sanitizePhone(c.phone));
            const firstName = this.escapeSql(c.name || c.firstName || '');
            const fields = this.escapeSql(JSON.stringify(c.customFields || {}));
            const tagArray = (c.tags || []).map((t: string) => `'${this.escapeSql(t)}'`);
            const tagsSql = tagArray.length > 0 ? `ARRAY[${tagArray.join(',')}]::text[]` : `ARRAY[]::text[]`;
            
            return `('${id}', '${orgId}', '${phone}', '${firstName}', '${fields}'::jsonb, ${tagsSql}, NOW(), NOW())`;
          }).join(',');

          const query = `
            INSERT INTO "contacts" ("id", "organizationId", "phone", "firstName", "customFields", "tags", "createdAt", "updatedAt")
            VALUES ${values}
            ON CONFLICT ("organizationId", "phone") DO UPDATE SET
              "firstName" = EXCLUDED."firstName",
              "customFields" = "contacts"."customFields" || EXCLUDED."customFields",
              "tags" = ARRAY(SELECT DISTINCT unnest(COALESCE("contacts"."tags", '{}') || COALESCE(EXCLUDED."tags", '{}'))),
              "updatedAt" = NOW();
          `;

          await tx.$executeRawUnsafe(query);
          
          processed += chunk.length;

          // Emit progress outside the async block if needed, but here we call the callback
          if (onProgress) {
            onProgress({ current: Math.min(processed, total), total });
          }
        }
      }, {
        timeout: 60000 // 60s timeout for large batches
      });

      return { success: true, count: total };
    } catch (err: any) {
      this.logger.error(`Bulk import failed. Rollback triggered. Error: ${err.message}`, err.stack);
      throw err;
    }
  }


  async getImportStatus(jobId: string) {
    const job = await this.importQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Import job not found');
    
    const state = await job.getState();
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    // Normalize status for UI
    let status = state.toUpperCase();
    if (status === 'WAITING' || status === 'DELAYED') status = 'QUEUED';
    
    let progress = 0;
    let current = 0;
    let total = 0;

    // job.progress is a function in Bull
    const actualProgressData = typeof job.progress === 'function' ? job.progress() : job.progress;

    if (typeof actualProgressData === 'object' && actualProgressData !== null) {
      current = actualProgressData.current || 0;
      total = actualProgressData.total || 0;
      progress = actualProgressData.progress || (total > 0 ? Math.floor((current / total) * 100) : 0);
    } else {
      progress = typeof actualProgressData === 'number' ? actualProgressData : 0;
    }

    return {
      id: jobId,
      status,
      progress,
      current,
      total,
      result,
      error: failedReason
    };
  }


  /**
   * Fetches contacts for an organization with support for server-side pagination and filtering.
   */
  async findAll(orgId: string, options: { 
    page: number; 
    limit: number; 
    search?: string; 
    status?: string; 
    tag?: string;
  }) {
    const { page, limit, search, status, tag } = options;
    const skip = (page - 1) * limit;

    // Building the where clause dynamically
    let finalOrgId = orgId;
    
    // Fallback: If orgId is missing, it's a critical failure for strict filtering.
    // NUCLEAR FIX: For SuperAdmins, if orgId is missing, we allow a global result.
    if (!finalOrgId) {
      this.logger.warn('[WARNING] ContactsService.findAll called without orgId. Performing potential GLOBAL search.');
    }

    const where: any = finalOrgId ? { organizationId: finalOrgId } : {};

    // Deep diagnostic log
    this.logger.debug(`[DEBUG] ContactsService.findAll - Org: ${finalOrgId}, Where: ${JSON.stringify(where)}, Options: ${JSON.stringify(options)}`);

    // DIAGNOSTIC LOGGING
    try {
      const logMsg = `[${new Date().toISOString()}] FIND_ALL: Org: ${orgId}, Options: ${JSON.stringify(options)}, Where: ${JSON.stringify(where)}\n`;
      require('fs').appendFileSync('D:/BizzRiser/BizzRiserPlatform/backend/contacts_debug.log', logMsg);
    } catch (e) {}

    if (status && status !== 'ALL' && status !== 'All Statuses') {
      where.status = status.toUpperCase();
    }

    if (tag && tag !== 'All Labels') {
      where.tags = { has: tag };
    }

    if (search) {
      const query = search.toLowerCase();
      where.OR = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [data, total, activeCount, blockedCount] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.contact.count({ where }),
      this.prisma.contact.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.contact.count({ where: { organizationId: orgId, status: 'BLOCKED' } }),
    ]);

    return {
      data,
      total,
      activeCount,
      blockedCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      debugOrgId: orgId, // TEMP DEBUG
    };
  }

  async getContactsCount(orgId: string, tags?: string[]) {
    if (tags && tags.length > 0) {
      let rawResult: { count: number }[];
      if (orgId) {
        rawResult = await this.prisma.$queryRaw`
          SELECT COUNT(*)::int as count FROM "contacts"
          WHERE "organizationId" = ${orgId} AND "tags" && ${tags}
        `;
      } else {
        rawResult = await this.prisma.$queryRaw`
          SELECT COUNT(*)::int as count FROM "contacts"
          WHERE "tags" && ${tags}
        `;
      }
      return { count: rawResult[0]?.count || 0 };
    }

    const count = await this.prisma.contact.count({
      where: orgId ? { organizationId: orgId } : {}
    });
    return { count };
  }

  async exportContacts(orgId: string, options: { 
    search?: string; 
    status?: string; 
    tag?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { search, status, tag, startDate, endDate } = options;
    
    let finalOrgId = orgId;
    const where: any = finalOrgId ? { organizationId: finalOrgId } : {};

    if (status && status !== 'ALL' && status !== 'All Statuses') {
      where.status = status.toUpperCase();
    }

    if (tag && tag !== 'All Labels') {
      where.tags = { has: tag };
    }

    if (search) {
      const query = search.toLowerCase();
      where.OR = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
       where.createdAt = {};
       if (startDate) where.createdAt.gte = new Date(startDate);
       if (endDate) {
         const end = new Date(endDate);
         end.setHours(23, 59, 59, 999);
         where.createdAt.lte = end;
       }
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return contacts.map(c => {
       const mapped: any = {
          'First Name': c.firstName || '',
          'Last Name': c.lastName || '',
          'Phone': c.phone || '',
          'Email': c.email || '',
          'Status': c.status || 'ACTIVE',
          'Tags': c.tags.join(', ') || '',
          'Created At': c.createdAt.toLocaleString(),
          'Updated At': c.updatedAt.toLocaleString()
       };

       // Flatten custom fields if present
       if (c.customFields && typeof c.customFields === 'object') {
          for (const [k, v] of Object.entries(c.customFields)) {
             mapped[`Custom: ${k}`] = v;
          }
       }
       return mapped;
    });
  }

  async getTagsAnalytics(orgId: string, includeSystem = false) {
    // Highly optimized raw SQL query for processing massive datasets (100k+ contacts)
    // Avoids loading hundreds of thousands of contacts into Node.js memory causing 30s timeouts.
    // UNNEST expands the tags array, allowing Postgres to do the counting instantly.
    const rawResult: { tag: string, count: number }[] = await this.prisma.$queryRaw`
      SELECT tag, COUNT(*)::int as count
      FROM contacts, UNNEST(tags) AS tag
      WHERE "organizationId" = ${orgId}
      GROUP BY tag
    `;

    return rawResult
      .filter(row => row.tag && (includeSystem || !row.tag.startsWith('_sys_')))
      .map(row => ({ name: row.tag, count: row.count }));
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
    this.logger.log(`Bulk delete request for Org: ${orgId}, IDs: ${contactIds.length}`);
    
    try {
      return await this.prisma.$transaction(async (tx) => {
        const CHUNK_SIZE = 5000;
        let totalDeleted = 0;

        for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
          const chunk = contactIds.slice(i, i + CHUNK_SIZE);
          
          // 1. Delete associated messages
          await tx.message.deleteMany({
            where: { contactId: { in: chunk }, organizationId: orgId }
          });

          // 2. Delete associated campaign recipients
          await tx.campaignRecipient.deleteMany({
            where: { contactId: { in: chunk } }
          });

          // 3. Delete associated conversations
          await tx.conversation.deleteMany({
            where: { contactId: { in: chunk }, organizationId: orgId }
          });

          // 4. Finally delete the contacts
          const contactResult = await tx.contact.deleteMany({
            where: { id: { in: chunk }, organizationId: orgId }
          });
          
          totalDeleted += contactResult.count;
        }

        this.logger.log(`Successfully deleted ${totalDeleted} contacts in chunks`);

        this.realtimeGateway.emitContactUpdate(orgId, 'contact:updated', { deleted: true });
        return { count: totalDeleted };
      }, {
        maxWait: 10000, // default: 2000
        timeout: 60000  // default: 5000 (5s is too short for 25k records)
      });
    } catch (err: any) {
      this.logger.error(`Failed to bulk delete contacts: ${err.message}`, err.stack);
      throw err;
    }
  }

  async deleteContactsByTag(orgId: string, tag: string) {
    this.logger.log(`Delete contacts request for Org: ${orgId} by tag: ${tag}`);
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId: orgId, tags: { has: tag } },
      select: { id: true }
    });
    const contactIds = contacts.map(c => c.id);
    if (contactIds.length === 0) return { count: 0 };
    return this.deleteContacts(orgId, contactIds);
  }

  async deleteUntaggedContacts(orgId: string) {
    this.logger.log(`Delete untagged contacts request for Org: ${orgId}`);
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId: orgId, tags: { equals: [] } },
      select: { id: true }
    });
    const contactIds = contacts.map(c => c.id);
    if (contactIds.length === 0) return { count: 0 };
    return this.deleteContacts(orgId, contactIds);
  }
}
