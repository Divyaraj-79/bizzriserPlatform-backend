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
exports.CannedResponsesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let CannedResponsesService = class CannedResponsesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(orgId) {
        return this.prisma.cannedResponse.findMany({
            where: { organizationId: orgId },
            orderBy: { shortcut: 'asc' },
        });
    }
    async create(orgId, data) {
        return this.prisma.cannedResponse.create({
            data: {
                ...data,
                organizationId: orgId,
            },
        });
    }
    async update(orgId, id, data) {
        const response = await this.prisma.cannedResponse.findUnique({ where: { id } });
        if (!response || response.organizationId !== orgId) {
            throw new common_1.NotFoundException('Canned response not found');
        }
        return this.prisma.cannedResponse.update({
            where: { id },
            data,
        });
    }
    async remove(orgId, id) {
        const response = await this.prisma.cannedResponse.findUnique({ where: { id } });
        if (!response || response.organizationId !== orgId) {
            throw new common_1.NotFoundException('Canned response not found');
        }
        return this.prisma.cannedResponse.delete({ where: { id } });
    }
};
exports.CannedResponsesService = CannedResponsesService;
exports.CannedResponsesService = CannedResponsesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CannedResponsesService);
//# sourceMappingURL=canned-responses.service.js.map