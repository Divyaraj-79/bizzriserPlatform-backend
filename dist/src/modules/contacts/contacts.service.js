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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ContactsService = class ContactsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createOrUpdate(orgId, phone, data) {
        return this.prisma.contact.upsert({
            where: { organizationId_phone: { organizationId: orgId, phone } },
            update: data,
            create: { ...data, organizationId: orgId, phone },
        });
    }
    async findAll(orgId) {
        return this.prisma.contact.findMany({
            where: { organizationId: orgId },
            orderBy: { updatedAt: 'desc' }
        });
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
        return this.prisma.contact.deleteMany({
            where: { id: { in: contactIds }, organizationId: orgId }
        });
    }
};
exports.ContactsService = ContactsService;
exports.ContactsService = ContactsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ContactsService);
//# sourceMappingURL=contacts.service.js.map