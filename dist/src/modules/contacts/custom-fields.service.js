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
exports.CustomFieldsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let CustomFieldsService = class CustomFieldsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(organizationId) {
        return this.prisma.customField.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async create(organizationId, data) {
        console.log('[CustomFieldsService] create params:', { organizationId, data });
        if (!organizationId) {
            console.error('[CustomFieldsService] Missing organizationId');
            throw new Error('Organization ID is missing in request.');
        }
        const existing = await this.prisma.customField.findUnique({
            where: {
                organizationId_name: {
                    organizationId,
                    name: data.name,
                },
            },
        });
        if (existing) {
            throw new Error(`A custom field with the name "${data.name}" already exists.`);
        }
        return this.prisma.customField.create({
            data: {
                organizationId,
                name: data.name,
                type: data.type || 'TEXT',
                isRequired: data.isRequired || false,
            },
        });
    }
    async delete(organizationId, id) {
        const field = await this.prisma.customField.findFirst({
            where: { id, organizationId }
        });
        if (!field) {
            throw new common_1.NotFoundException('Custom field not found');
        }
        return this.prisma.customField.delete({
            where: { id },
        });
    }
};
exports.CustomFieldsService = CustomFieldsService;
exports.CustomFieldsService = CustomFieldsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomFieldsService);
//# sourceMappingURL=custom-fields.service.js.map