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
exports.ContactNotesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ContactNotesService = class ContactNotesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(orgId, contactId) {
        return this.prisma.contactNote.findMany({
            where: { contactId, organizationId: orgId },
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
        });
    }
    async create(orgId, contactId, userId, body) {
        return this.prisma.contactNote.create({
            data: {
                organizationId: orgId,
                contactId,
                userId,
                body,
            },
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
        });
    }
    async update(orgId, noteId, body) {
        const note = await this.prisma.contactNote.findUnique({ where: { id: noteId } });
        if (!note || note.organizationId !== orgId) {
            throw new common_1.NotFoundException('Note not found');
        }
        return this.prisma.contactNote.update({
            where: { id: noteId },
            data: { body },
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
        });
    }
    async remove(orgId, noteId) {
        const note = await this.prisma.contactNote.findUnique({ where: { id: noteId } });
        if (!note || note.organizationId !== orgId) {
            throw new common_1.NotFoundException('Note not found');
        }
        return this.prisma.contactNote.delete({ where: { id: noteId } });
    }
};
exports.ContactNotesService = ContactNotesService;
exports.ContactNotesService = ContactNotesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ContactNotesService);
//# sourceMappingURL=contact-notes.service.js.map