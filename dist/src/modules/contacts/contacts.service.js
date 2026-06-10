"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ContactsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../prisma/prisma.service");
const uuid_1 = require("uuid");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
let ContactsService = ContactsService_1 = class ContactsService {
    prisma;
    importQueue;
    realtimeGateway;
    logger = new common_1.Logger(ContactsService_1.name);
    constructor(prisma, importQueue, realtimeGateway) {
        this.prisma = prisma;
        this.importQueue = importQueue;
        this.realtimeGateway = realtimeGateway;
    }
    sanitizePhone(phone) {
        if (!phone)
            return '';
        let clean = String(phone);
        if (clean.includes('E+') || clean.includes('e+')) {
            clean = Number(clean).toLocaleString('fullwide', { useGrouping: false });
        }
        return clean.replace(/\D/g, '');
    }
    async findOne(orgId, contactId) {
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
        if (!contact)
            throw new common_1.NotFoundException('Contact not found');
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
    async uploadAvatar(orgId, contactId, file) {
        const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const updated = await this.prisma.contact.update({
            where: { id: contactId },
            data: { avatarUrl: base64 },
        });
        return { avatarUrl: updated.avatarUrl };
    }
    async updateContact(orgId, contactId, data) {
        console.log('[ContactsService] updateContact request:', { orgId, contactId, data });
        const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
        if (!contact || contact.organizationId !== orgId) {
            console.error('[ContactsService] Contact not found or org mismatch:', { contactId, orgId });
            throw new common_1.NotFoundException('Contact not found');
        }
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
    async createOrUpdate(orgId, phone, data) {
        this.logger.log(`[ENTRY] createOrUpdate called for Org: ${orgId}, Phone: ${phone}`);
        const cleanPhone = this.sanitizePhone(phone);
        const { tags, ...otherData } = data || {};
        const baseData = {
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
    async bulkCreateOrUpdate(orgId, contacts) {
        const resolvedOrgId = orgId || 'GLOBAL';
        this.logger.log(`Bulk import request for Org: ${resolvedOrgId}, Count: ${contacts?.length}`);
        try {
            if (!contacts || !Array.isArray(contacts)) {
                throw new Error('Invalid contacts data provided');
            }
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
            const job = await this.importQueue.add('import-contacts', {
                orgId,
                contacts: uniqueContacts,
                originalCount: contacts.length,
                duplicatesRemoved: totalDuplicates,
                newCount: trulyNewCount,
                existingCount: existingCount
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400 },
            });
            return {
                jobId: job.id,
                totalContacts: uniqueCount,
                originalCount: contacts.length,
                duplicatesRemoved: totalDuplicates,
                newCount: trulyNewCount,
                status: 'QUEUED'
            };
        }
        catch (err) {
            this.logger.error(`Failed to queue bulk import: ${err.message}`, err.stack);
            throw err;
        }
    }
    escapeSql(val) {
        if (val === null || val === undefined)
            return '';
        return String(val)
            .replace(/'/g, "''")
            .replace(/\\/g, "\\\\")
            .replace(/\0/g, "");
    }
    async atomicBulkImport(orgId, contacts, onProgress) {
        const CHUNK_SIZE = 200;
        const total = contacts.length;
        let processed = 0;
        try {
            await this.prisma.$transaction(async (tx) => {
                for (let i = 0; i < total; i += CHUNK_SIZE) {
                    const chunk = contacts.slice(i, i + CHUNK_SIZE);
                    const values = chunk.map(c => {
                        const id = (0, uuid_1.v4)();
                        const phone = this.escapeSql(this.sanitizePhone(c.phone));
                        const firstName = this.escapeSql(c.name || c.firstName || '');
                        const fields = this.escapeSql(JSON.stringify(c.customFields || {}));
                        const tagArray = (c.tags || []).map((t) => `'${this.escapeSql(t)}'`);
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
                    if (onProgress) {
                        onProgress({ current: Math.min(processed, total), total });
                    }
                }
            }, {
                timeout: 60000
            });
            return { success: true, count: total };
        }
        catch (err) {
            this.logger.error(`Bulk import failed. Rollback triggered. Error: ${err.message}`, err.stack);
            throw err;
        }
    }
    async getImportStatus(jobId) {
        const job = await this.importQueue.getJob(jobId);
        if (!job)
            throw new common_1.NotFoundException('Import job not found');
        const state = await job.getState();
        const result = job.returnvalue;
        const failedReason = job.failedReason;
        let status = state.toUpperCase();
        if (status === 'WAITING' || status === 'DELAYED')
            status = 'QUEUED';
        let progress = 0;
        let current = 0;
        let total = 0;
        const actualProgressData = typeof job.progress === 'function' ? job.progress() : job.progress;
        if (typeof actualProgressData === 'object' && actualProgressData !== null) {
            current = actualProgressData.current || 0;
            total = actualProgressData.total || 0;
            progress = actualProgressData.progress || (total > 0 ? Math.floor((current / total) * 100) : 0);
        }
        else {
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
    async findAll(orgId, options) {
        const { page, limit, search, status, tag } = options;
        const skip = (page - 1) * limit;
        let finalOrgId = orgId;
        if (!finalOrgId) {
            this.logger.warn('[WARNING] ContactsService.findAll called without orgId. Performing potential GLOBAL search.');
        }
        const where = finalOrgId ? { organizationId: finalOrgId } : {};
        this.logger.debug(`[DEBUG] ContactsService.findAll - Org: ${finalOrgId}, Where: ${JSON.stringify(where)}, Options: ${JSON.stringify(options)}`);
        try {
            const logMsg = `[${new Date().toISOString()}] FIND_ALL: Org: ${orgId}, Options: ${JSON.stringify(options)}, Where: ${JSON.stringify(where)}\n`;
            require('fs').appendFileSync('D:/BizzRiser/BizzRiserPlatform/backend/contacts_debug.log', logMsg);
        }
        catch (e) { }
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
            debugOrgId: orgId,
        };
    }
    async getContactsCount(orgId, tags) {
        const where = { organizationId: orgId };
        if (tags && tags.length > 0) {
            where.tags = { hasSome: tags };
        }
        const count = await this.prisma.contact.count({ where });
        return { count };
    }
    async exportContacts(orgId, options) {
        const { search, status, tag, startDate, endDate } = options;
        let finalOrgId = orgId;
        const where = finalOrgId ? { organizationId: finalOrgId } : {};
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
            if (startDate)
                where.createdAt.gte = new Date(startDate);
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
            const mapped = {
                'First Name': c.firstName || '',
                'Last Name': c.lastName || '',
                'Phone': c.phone || '',
                'Email': c.email || '',
                'Status': c.status || 'ACTIVE',
                'Tags': c.tags.join(', ') || '',
                'Created At': c.createdAt.toLocaleString(),
                'Updated At': c.updatedAt.toLocaleString()
            };
            if (c.customFields && typeof c.customFields === 'object') {
                for (const [k, v] of Object.entries(c.customFields)) {
                    mapped[`Custom: ${k}`] = v;
                }
            }
            return mapped;
        });
    }
    async getTagsAnalytics(orgId, includeSystem = false) {
        const rawResult = await this.prisma.$queryRaw `
      SELECT tag, COUNT(*)::int as count
      FROM contacts, UNNEST(tags) AS tag
      WHERE "organizationId" = ${orgId}
      GROUP BY tag
    `;
        return rawResult
            .filter(row => row.tag && (includeSystem || !row.tag.startsWith('_sys_')))
            .map(row => ({ name: row.tag, count: row.count }));
    }
    async bulkAddTags(orgId, contactIds, tags) {
        const promises = contactIds.map(async (id) => {
            const contact = await this.prisma.contact.findUnique({ where: { id } });
            if (!contact)
                return;
            const newTags = Array.from(new Set([...contact.tags, ...tags]));
            return this.prisma.contact.update({
                where: { id },
                data: { tags: newTags }
            });
        });
        return Promise.all(promises);
    }
    async bulkRemoveTags(orgId, contactIds, tags) {
        const promises = contactIds.map(async (id) => {
            const contact = await this.prisma.contact.findUnique({ where: { id } });
            if (!contact)
                return;
            const newTags = contact.tags.filter(t => !tags.includes(t));
            return this.prisma.contact.update({
                where: { id },
                data: { tags: newTags }
            });
        });
        return Promise.all(promises);
    }
    async deleteContacts(orgId, contactIds) {
        this.logger.log(`Bulk delete request for Org: ${orgId}, IDs: ${contactIds.length}`);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const CHUNK_SIZE = 5000;
                let totalDeleted = 0;
                for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
                    const chunk = contactIds.slice(i, i + CHUNK_SIZE);
                    await tx.message.deleteMany({
                        where: { contactId: { in: chunk }, organizationId: orgId }
                    });
                    await tx.campaignRecipient.deleteMany({
                        where: { contactId: { in: chunk } }
                    });
                    await tx.conversation.deleteMany({
                        where: { contactId: { in: chunk }, organizationId: orgId }
                    });
                    const contactResult = await tx.contact.deleteMany({
                        where: { id: { in: chunk }, organizationId: orgId }
                    });
                    totalDeleted += contactResult.count;
                }
                this.logger.log(`Successfully deleted ${totalDeleted} contacts in chunks`);
                this.realtimeGateway.emitContactUpdate(orgId, 'contact:updated', { deleted: true });
                return { count: totalDeleted };
            }, {
                maxWait: 10000,
                timeout: 60000
            });
        }
        catch (err) {
            this.logger.error(`Failed to bulk delete contacts: ${err.message}`, err.stack);
            throw err;
        }
    }
    async deleteContactsByTag(orgId, tag) {
        this.logger.log(`Delete contacts request for Org: ${orgId} by tag: ${tag}`);
        const contacts = await this.prisma.contact.findMany({
            where: { organizationId: orgId, tags: { has: tag } },
            select: { id: true }
        });
        const contactIds = contacts.map(c => c.id);
        if (contactIds.length === 0)
            return { count: 0 };
        return this.deleteContacts(orgId, contactIds);
    }
    async deleteUntaggedContacts(orgId) {
        this.logger.log(`Delete untagged contacts request for Org: ${orgId}`);
        const contacts = await this.prisma.contact.findMany({
            where: { organizationId: orgId, tags: { equals: [] } },
            select: { id: true }
        });
        const contactIds = contacts.map(c => c.id);
        if (contactIds.length === 0)
            return { count: 0 };
        return this.deleteContacts(orgId, contactIds);
    }
};
exports.ContactsService = ContactsService;
exports.ContactsService = ContactsService = ContactsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('contact-import')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, realtime_gateway_1.RealtimeGateway])
], ContactsService);
//# sourceMappingURL=contacts.service.js.map