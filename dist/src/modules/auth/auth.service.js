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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const users_service_1 = require("../users/users.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const activity_logger_service_1 = require("../activity-logs/activity-logger.service");
const bcrypt = __importStar(require("bcryptjs"));
let AuthService = AuthService_1 = class AuthService {
    usersService;
    jwtService;
    configService;
    prisma;
    activityLogger;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(usersService, jwtService, configService, prisma, activityLogger) {
        this.usersService = usersService;
        this.jwtService = jwtService;
        this.configService = configService;
        this.prisma = prisma;
        this.activityLogger = activityLogger;
    }
    async validateUser(email, pass) {
        const user = await this.usersService.findByEmail(email);
        if (user && await bcrypt.compare(pass, user.passwordHash)) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }
    async login(user, ip) {
        if (ip && user.id) {
            try {
                await this.usersService.update(user.id, {
                    lastIp: ip,
                    lastLoginAt: new Date()
                });
                await this.activityLogger.log(user.id, 'user_login', { ip, timestamp: new Date() }, ip);
            }
            catch (err) {
                console.error('[Auth Service] Failed to update login audit:', err);
            }
        }
        const accessTokenPayload = {
            email: user.email,
            sub: user.id,
            orgId: user.organizationId,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            originalOrgId: user.organizationId,
            permissions: user.permissions || {}
        };
        const refreshTokenPayload = { sub: user.id };
        return {
            access_token: this.jwtService.sign(accessTokenPayload),
            refresh_token: this.jwtService.sign(refreshTokenPayload, {
                secret: this.configService.get('jwt.refreshSecret'),
                expiresIn: this.configService.get('jwt.refreshExpiresIn'),
            }),
        };
    }
    async switchTenant(user, targetOrgId) {
        const accessTokenPayload = {
            email: user.email,
            sub: user.sub,
            orgId: targetOrgId,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            originalOrgId: user.originalOrgId || user.orgId,
            isImpersonating: true
        };
        const refreshTokenPayload = { sub: user.userId || user.sub };
        return {
            access_token: this.jwtService.sign(accessTokenPayload),
            refresh_token: this.jwtService.sign(refreshTokenPayload, {
                secret: this.configService.get('jwt.refreshSecret'),
                expiresIn: this.configService.get('jwt.refreshExpiresIn'),
            }),
        };
    }
    async refreshToken(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('jwt.refreshSecret'),
            });
            const user = await this.usersService.findOne(payload.sub);
            if (!user)
                throw new common_1.UnauthorizedException('User not found');
            const accessTokenPayload = {
                email: user.email,
                sub: user.id,
                orgId: user.organizationId,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName,
                originalOrgId: user.organizationId
            };
            return {
                access_token: this.jwtService.sign(accessTokenPayload),
            };
        }
        catch (e) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async getAccountPermissions(userId, accountId) {
        const user = await this.usersService.findOne(userId);
        if (!user)
            return [];
        if (user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN') {
            return ['all'];
        }
        const permissions = user.permissions || {};
        return Object.keys(permissions);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        jwt_1.JwtService,
        config_1.ConfigService,
        prisma_service_1.PrismaService,
        activity_logger_service_1.ActivityLoggerService])
], AuthService);
//# sourceMappingURL=auth.service.js.map