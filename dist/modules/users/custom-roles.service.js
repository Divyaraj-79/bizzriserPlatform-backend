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
exports.CustomRolesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let CustomRolesService = class CustomRolesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(organizationId) {
        return this.prisma.customRole.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async create(organizationId, data) {
        const existing = await this.prisma.customRole.findFirst({
            where: { organizationId, name: data.name },
        });
        if (existing)
            throw new common_1.ConflictException('A role with this name already exists');
        return this.prisma.customRole.create({
            data: {
                organizationId,
                name: data.name,
                permissions: data.permissions,
            },
        });
    }
    async remove(id, organizationId) {
        const role = await this.prisma.customRole.findFirst({
            where: { id, organizationId },
        });
        if (!role)
            throw new common_1.NotFoundException('Custom role not found');
        return this.prisma.customRole.delete({ where: { id } });
    }
};
exports.CustomRolesService = CustomRolesService;
exports.CustomRolesService = CustomRolesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomRolesService);
//# sourceMappingURL=custom-roles.service.js.map