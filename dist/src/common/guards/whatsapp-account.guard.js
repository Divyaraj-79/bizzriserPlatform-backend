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
exports.WhatsAppAccountGuard = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let WhatsAppAccountGuard = class WhatsAppAccountGuard {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async canActivate(context) {
        try {
            const request = context.switchToHttp().getRequest();
            const user = request.user;
            if (!user || !user.role) {
                return true;
            }
            if (user.role === client_1.UserRole.AGENT) {
                try {
                    const allowedAccess = await this.prisma.whatsAppAccountAccess.findMany({
                        where: { userId: user.userId || user.sub },
                        select: { whatsappAccountId: true },
                    });
                    user.allowedAccountIds = allowedAccess.map(a => a.whatsappAccountId);
                    request.allowedAccountIds = user.allowedAccountIds;
                }
                catch (err) {
                    console.error('[WhatsAppAccountGuard] Failed to fetch allowed accounts:', err);
                    user.allowedAccountIds = [];
                }
            }
            const accountId = request.params.accountId ||
                request.params.id ||
                request.query.accountId ||
                request.body.accountId ||
                request.body.whatsappAccountId;
            if (!accountId) {
                return true;
            }
            if (user.role === client_1.UserRole.AGENT) {
                const allowed = Array.isArray(user.allowedAccountIds) && user.allowedAccountIds.includes(accountId);
                if (!allowed) {
                    throw new common_1.ForbiddenException('Access denied: You are not assigned to this WhatsApp Account.');
                }
            }
            return true;
        }
        catch (error) {
            console.error('[WhatsAppAccountGuard] Global Catch Error:', error);
            if (error instanceof common_1.ForbiddenException)
                throw error;
            return true;
        }
    }
};
exports.WhatsAppAccountGuard = WhatsAppAccountGuard;
exports.WhatsAppAccountGuard = WhatsAppAccountGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WhatsAppAccountGuard);
//# sourceMappingURL=whatsapp-account.guard.js.map