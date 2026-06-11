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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const bcrypt = __importStar(require("bcryptjs"));
const activity_logger_service_1 = require("../activity-logs/activity-logger.service");
let UsersService = class UsersService {
    prisma;
    activityLogger;
    constructor(prisma, activityLogger) {
        this.prisma = prisma;
        this.activityLogger = activityLogger;
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                accountAccess: {
                    include: {
                        whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
                    }
                }
            },
        });
        if (!user)
            throw new common_1.NotFoundException(`User with ID ${id} not found`);
        return user;
    }
    async findByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
            include: {
                accountAccess: {
                    include: {
                        whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
                    }
                }
            },
        });
    }
    async update(id, data) {
        return this.prisma.user.update({ where: { id }, data });
    }
    async findAllByOrganization(organizationId) {
        return this.prisma.user.findMany({
            where: { organizationId },
            include: {
                accountAccess: {
                    include: {
                        whatsappAccount: { select: { id: true, displayName: true } }
                    }
                }
            },
            orderBy: { createdAt: 'asc' },
        });
    }
    async create(data) {
        const { password, accountAssignments, ...userData } = data;
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: userData.email,
                passwordHash,
                firstName: userData.firstName,
                lastName: userData.lastName || '',
                role: userData.role || 'AGENT',
                organization: { connect: { id: userData.organizationId } },
                status: userData.status || 'ACTIVE',
                timezone: userData.timezone || 'UTC',
                permissions: userData.permissions || {},
                accountAccess: {
                    create: accountAssignments?.map((a) => ({
                        whatsappAccountId: a.whatsappAccountId
                    })) || []
                }
            },
        });
        await this.activityLogger.log(userData.organizationId, 'member_created', { email: userData.email, role: userData.role || 'AGENT' });
        return user;
    }
    async updateUser(id, organizationId, data) {
        const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
        if (!user)
            throw new common_1.NotFoundException('User not found in this organization');
        const updateData = {};
        if (data.firstName !== undefined)
            updateData.firstName = data.firstName;
        if (data.lastName !== undefined)
            updateData.lastName = data.lastName;
        if (data.status !== undefined)
            updateData.status = data.status;
        if (data.permissions !== undefined)
            updateData.permissions = data.permissions;
        if (data.timezone !== undefined)
            updateData.timezone = data.timezone;
        if (data.accountAssignments) {
            await this.prisma.whatsAppAccountAccess.deleteMany({ where: { userId: id } });
            updateData.accountAccess = {
                create: data.accountAssignments.map((a) => ({
                    whatsappAccountId: a.whatsappAccountId
                }))
            };
        }
        return this.prisma.user.update({
            where: { id },
            data: updateData,
            include: {
                accountAccess: true
            },
        });
    }
    async remove(id, organizationId) {
        const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
        if (!user)
            throw new common_1.NotFoundException('User not found in this organization');
        const deletedUser = await this.prisma.user.delete({ where: { id } });
        await this.activityLogger.log(organizationId, 'member_removed', { email: user.email, userId: id });
        return deletedUser;
    }
    async updateRole(id, organizationId, role) {
        const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
        if (!user)
            throw new common_1.NotFoundException('User not found in this organization');
        return this.prisma.user.update({ where: { id }, data: { role } });
    }
    async getAccountAccess(userId, whatsappAccountId) {
        return this.prisma.whatsAppAccountAccess.findUnique({
            where: {
                userId_whatsappAccountId: {
                    userId,
                    whatsappAccountId,
                },
            }
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_logger_service_1.ActivityLoggerService])
], UsersService);
//# sourceMappingURL=users.service.js.map