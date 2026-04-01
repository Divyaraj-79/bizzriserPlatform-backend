"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
let OrganizationsService = class OrganizationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        const exists = await this.prisma.organization.findUnique({
            where: { slug: data.slug },
        });
        if (exists)
            throw new common_1.ConflictException(`Slug ${data.slug} is already taken`);
        return this.prisma.organization.create({ data });
    }
    async createWithAdmin(orgData, adminData) {
        const slugExists = await this.prisma.organization.findUnique({ where: { slug: orgData.slug } });
        if (slugExists)
            throw new common_1.ConflictException(`Slug ${orgData.slug} already exists`);
        const userExists = await this.prisma.user.findUnique({ where: { email: adminData.email } });
        if (userExists)
            throw new common_1.ConflictException(`User with email ${adminData.email} already exists`);
        const passwordHash = await bcrypt.hash(adminData.password || 'BizzRiser@79', 10);
        return this.prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name: orgData.name,
                    slug: orgData.slug,
                    address: orgData.address,
                    whatsappNumber: orgData.whatsappNumber,
                    expiryDate: orgData.expiryDate ? new Date(orgData.expiryDate) : null,
                    package: orgData.package,
                    isPhoneVerified: orgData.isPhoneVerified || false,
                    status: orgData.status || 'ACTIVE',
                },
            });
            const admin = await tx.user.create({
                data: {
                    organizationId: org.id,
                    email: adminData.email,
                    firstName: adminData.firstName,
                    lastName: adminData.lastName,
                    passwordHash,
                    role: client_1.UserRole.ORG_ADMIN,
                },
            });
            return { org, admin };
        });
    }
    async findById(id) {
        const org = await this.prisma.organization.findUnique({
            where: { id },
        });
        if (!org)
            throw new common_1.NotFoundException(`Organization not found`);
        return org;
    }
    async findAll() {
        return this.prisma.organization.findMany({
            include: {
                users: {
                    where: { role: client_1.UserRole.ORG_ADMIN },
                    take: 1,
                    select: {
                        email: true,
                        firstName: true,
                        lastName: true,
                        lastIp: true,
                        lastLoginAt: true,
                    }
                },
                _count: {
                    select: { users: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }
    async update(id, data) {
        return this.prisma.organization.update({
            where: { id },
            data: {
                name: data.name,
                slug: data.slug,
                address: data.address,
                whatsappNumber: data.whatsappNumber,
                expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
                package: data.package,
                isPhoneVerified: data.isPhoneVerified,
                status: data.status,
            }
        });
    }
    async delete(id) {
        return this.prisma.organization.delete({
            where: { id }
        });
    }
    async findOne(id) {
        return this.prisma.organization.findUnique({
            where: { id },
            include: {
                users: {
                    where: { role: client_1.UserRole.ORG_ADMIN },
                    take: 1,
                }
            }
        });
    }
};
exports.OrganizationsService = OrganizationsService;
exports.OrganizationsService = OrganizationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrganizationsService);
//# sourceMappingURL=organizations.service.js.map