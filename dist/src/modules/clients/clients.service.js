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
exports.ClientsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
let ClientsService = class ClientsService {
    prisma;
    authService;
    constructor(prisma, authService) {
        this.prisma = prisma;
        this.authService = authService;
    }
    async findAll() {
        return this.prisma.organization.findMany({
            where: {
                NOT: {
                    slug: 'super-admin'
                }
            },
            include: {
                users: {
                    where: { role: client_1.UserRole.ORG_ADMIN },
                    take: 1,
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
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
    async onboard(data) {
        const { organization, admin } = data;
        const slugExists = await this.prisma.organization.findUnique({ where: { slug: organization.slug } });
        if (slugExists)
            throw new common_1.ConflictException(`Slug ${organization.slug} already exists`);
        const userExists = await this.prisma.user.findUnique({ where: { email: admin.email } });
        if (userExists)
            throw new common_1.ConflictException(`User with email ${admin.email} already exists`);
        const passwordHash = await bcrypt.hash(admin.password || 'BizzRiser@123', 10);
        return this.prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name: organization.name,
                    slug: organization.slug,
                    expiryDate: organization.expiryDate ? new Date(organization.expiryDate) : null,
                    package: organization.package || 'FREE',
                    status: 'ACTIVE',
                    metadata: organization.permissions ? { permissions: organization.permissions } : {}
                },
            });
            const user = await tx.user.create({
                data: {
                    email: admin.email,
                    passwordHash,
                    firstName: admin.firstName || '',
                    lastName: admin.lastName || '',
                    role: client_1.UserRole.ORG_ADMIN,
                    organizationId: org.id,
                }
            });
            return { organization: org, admin: user };
        });
    }
    async update(id, data) {
        const org = await this.prisma.organization.findUnique({ where: { id } });
        if (!org)
            throw new common_1.NotFoundException(`Organization with ID ${id} not found`);
        return this.prisma.organization.update({
            where: { id },
            data: {
                name: data.organization?.name,
                slug: data.organization?.slug,
                expiryDate: data.organization?.expiryDate ? new Date(data.organization?.expiryDate) : undefined,
                package: data.organization?.package,
                status: data.organization?.status,
                metadata: data.organization?.permissions ? { permissions: data.organization?.permissions } : undefined
            }
        });
    }
    async delete(id) {
        const org = await this.prisma.organization.findUnique({ where: { id } });
        if (!org)
            throw new common_1.NotFoundException(`Organization with ID ${id} not found`);
        return this.prisma.$transaction(async (tx) => {
            await tx.user.deleteMany({ where: { organizationId: id } });
            return tx.organization.delete({ where: { id } });
        });
    }
    async loginAsClient(id, currentUser) {
        const org = await this.prisma.organization.findUnique({ where: { id } });
        if (!org)
            throw new common_1.NotFoundException(`Organization with ID ${id} not found`);
        const adminUser = await this.prisma.user.findFirst({
            where: { organizationId: id, role: client_1.UserRole.ORG_ADMIN }
        });
        if (!adminUser)
            throw new common_1.NotFoundException(`No admin user found for organization ${org.name}`);
        return this.authService.switchTenant({
            email: adminUser.email,
            sub: adminUser.id,
            orgId: adminUser.organizationId,
            role: adminUser.role,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
            originalOrgId: currentUser.orgId || currentUser.organizationId
        }, id);
    }
};
exports.ClientsService = ClientsService;
exports.ClientsService = ClientsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], ClientsService);
//# sourceMappingURL=clients.service.js.map