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
let ContactsService = ContactsService_1 = class ContactsService {
    prisma;
    importQueue;
    logger = new common_1.Logger(ContactsService_1.name);
    constructor(prisma, importQueue) {
        this.prisma = prisma;
        this.importQueue = importQueue;
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
            }
        });
        console.log('[ContactsService] update success:', result.id);
        return result;
    }
    async createOrUpdate(orgId, phone, data) {
        this.logger.log(`[ENTRY] createOrUpdate called for Org: ${orgId}, Phone: ${phone}`);
        const cleanPhone = this.sanitizePhone(phone);
        const { name, tags, ...otherData } = data;
        const baseData = {
            ...otherData,
            firstName: name || otherData.firstName || '',
            organizationId: orgId,
            phone: cleanPhone,
        };
        return this.prisma.contact.upsert({
            where: {
                organizationId_phone: { organizationId: orgId, phone: cleanPhone },
            },
            update: {
                ...baseData,
                tags: tags ? { set: tags } : undefined,
            },
            create: {
                ...baseData,
                tags: tags || [],
            },
        });
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
            const job = await this.importQueue.add('import-contacts', {
                orgId,
                contacts: uniqueContacts,
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400 },
            });
            this.logger.log(`Successfully queued job ${job?.id} for ${uniqueContacts.length} contacts`);
            this.logger.debug(`Job details: ${JSON.stringify(job)}`);
            return {
                jobId: job.id,
                totalContacts: contacts.length,
                uniqueContacts: uniqueContacts.length,
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
        return String(val).replace(/'/g, "''");
    }
    async atomicBulkImport(orgId, contacts, onProgress) {
        const CHUNK_SIZE = 1000;
        const total = contacts.length;
        try {
            return await this.prisma.$transaction(async (tx) => {
                for (let i = 0; i < total; i += CHUNK_SIZE) {
                    const chunk = contacts.slice(i, i + CHUNK_SIZE);
                    const values = chunk.map(c => {
                        const id = (0, uuid_1.v4)();
                        const phone = this.escapeSql(c.phone);
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
              "customFields" = EXCLUDED."customFields",
              "tags" = EXCLUDED."tags",
              "updatedAt" = NOW();
          `;
                    await tx.$executeRawUnsafe(query);
                    if (onProgress) {
                        onProgress(Math.min(100, Math.floor(((i + chunk.length) / total) * 100)));
                    }
                }
            }, {
                timeout: 600000
            });
        }
        catch (err) {
            this.logger.error(`Atomic bulk import failed: ${err.message}`, err.stack);
            throw err;
        }
    }
    async getImportStatus(jobId) {
        const job = await this.importQueue.getJob(jobId);
        if (!job)
            throw new common_1.NotFoundException('Import job not found');
        const state = await job.getState();
        const progress = job.progress || 0;
        const result = job.returnvalue;
        const failedReason = job.failedReason;
        let status = state.toUpperCase();
        if (status === 'WAITING' || status === 'DELAYED')
            status = 'QUEUED';
        if (status === 'COMPLETED')
            status = 'COMPLETED';
        return {
            id: jobId,
            status,
            progress: typeof progress === 'number' ? progress : 0,
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
    async getTagsAnalytics(orgId) {
        const contacts = await this.prisma.contact.findMany({
            where: { organizationId: orgId },
            select: { tags: true }
        });
        const tagCounts = {};
        contacts.forEach(c => {
            c.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        return Object.entries(tagCounts).map(([name, count]) => ({ name, count }));
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
                const msgResult = await tx.message.deleteMany({
                    where: { contactId: { in: contactIds }, organizationId: orgId }
                });
                this.logger.log(`Deleted ${msgResult.count} associated messages`);
                const campaignResult = await tx.campaignRecipient.deleteMany({
                    where: { contactId: { in: contactIds } }
                });
                this.logger.log(`Deleted ${campaignResult.count} campaign recipient records`);
                const convResult = await tx.conversation.deleteMany({
                    where: { contactId: { in: contactIds }, organizationId: orgId }
                });
                this.logger.log(`Deleted ${convResult.count} conversations`);
                const contactResult = await tx.contact.deleteMany({
                    where: { id: { in: contactIds }, organizationId: orgId }
                });
                this.logger.log(`Successfully deleted ${contactResult.count} contacts`);
                return contactResult;
            });
        }
        catch (err) {
            this.logger.error(`Failed to bulk delete contacts: ${err.message}`, err.stack);
            throw err;
        }
    }
};
exports.ContactsService = ContactsService;
exports.ContactsService = ContactsService = ContactsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('contact-import')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], ContactsService);
//# sourceMappingURL=contacts.service.js.map