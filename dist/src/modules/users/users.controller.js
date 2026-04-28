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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("./users.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_guard_1 = require("../../common/guards/permissions.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
const client_1 = require("@prisma/client");
const create_user_dto_1 = require("./dto/create-user.dto");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    async findAll(req) {
        return this.usersService.findAllByOrganization(req.user.orgId);
    }
    async create(req, createUserDto) {
        const currentUser = req.user;
        if (currentUser.orgId) {
            createUserDto.organizationId = currentUser.orgId;
        }
        if (currentUser.role === client_1.UserRole.ORG_ADMIN && createUserDto.role === client_1.UserRole.SUPER_ADMIN) {
            throw new common_1.ForbiddenException('Cannot create Super Admin');
        }
        return this.usersService.create(createUserDto);
    }
    async getProfile(req) {
        return this.usersService.findOne(req.user.userId);
    }
    async updateUser(req, id, body) {
        return this.usersService.updateUser(id, req.user.orgId, body);
    }
    async remove(req, id) {
        return this.usersService.remove(id, req.user.orgId);
    }
    async updateRole(req, id, role) {
        if (role === client_1.UserRole.SUPER_ADMIN && req.user.role !== client_1.UserRole.SUPER_ADMIN) {
            throw new common_1.ForbiddenException('Cannot assign Super Admin role');
        }
        return this.usersService.updateRole(id, req.user.orgId, role);
    }
    async getMyPermissions(req) {
        const user = await this.usersService.findOne(req.user.sub);
        const userPermissions = user.permissions || {};
        const finalPermissions = { ...userPermissions };
        finalPermissions['dashboard:view'] = true;
        return finalPermissions;
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('view:manage-users'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('manage:team'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('profile'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('manage:team'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('manage:team'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)(':id/role'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Get)('me/permissions'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getMyPermissions", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.Controller)('users'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map