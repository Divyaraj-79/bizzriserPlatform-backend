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
exports.CustomRolesController = void 0;
const common_1 = require("@nestjs/common");
const custom_roles_service_1 = require("./custom-roles.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_guard_1 = require("../../common/guards/permissions.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
const client_1 = require("@prisma/client");
let CustomRolesController = class CustomRolesController {
    customRolesService;
    constructor(customRolesService) {
        this.customRolesService = customRolesService;
    }
    async findAll(req) {
        return this.customRolesService.findAll(req.user.orgId);
    }
    async create(req, data) {
        return this.customRolesService.create(req.user.orgId, data);
    }
    async remove(req, id) {
        return this.customRolesService.remove(id, req.user.orgId);
    }
};
exports.CustomRolesController = CustomRolesController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('manage:team'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CustomRolesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('manage:team'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CustomRolesController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN, client_1.UserRole.SUPER_ADMIN),
    (0, permissions_decorator_1.Permissions)('manage:team'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CustomRolesController.prototype, "remove", null);
exports.CustomRolesController = CustomRolesController = __decorate([
    (0, common_1.Controller)('custom-roles'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [custom_roles_service_1.CustomRolesService])
], CustomRolesController);
//# sourceMappingURL=custom-roles.controller.js.map