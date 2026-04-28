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
exports.WhatsappController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const whatsapp_service_1 = require("./whatsapp.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
const roles_guard_1 = require("../../common/guards/roles.guard");
const whatsapp_account_guard_1 = require("../../common/guards/whatsapp-account.guard");
const client_1 = require("@prisma/client");
let WhatsappController = class WhatsappController {
    whatsappService;
    constructor(whatsappService) {
        this.whatsappService = whatsappService;
    }
    async connectAccount(req, data) {
        return this.whatsappService.connectAccount(req.user.orgId, data);
    }
    async listAccounts(req) {
        return this.whatsappService.listAccounts(req.user.orgId, req.user);
    }
    async getTemplates(req, id, sync) {
        const forceSync = sync === 'true';
        return this.whatsappService.getTemplates(req.user.orgId, id, forceSync);
    }
    async createTemplate(req, id, data) {
        return this.whatsappService.createTemplate(req.user.orgId, id, data);
    }
    async uploadTemplateMedia(req, id, file) {
        return this.whatsappService.uploadTemplateMedia(req.user.orgId, id, file);
    }
    async updateTemplate(req, id, templateId, data) {
        return this.whatsappService.updateTemplate(req.user.orgId, id, templateId, data);
    }
    async deleteTemplate(req, id, templateName) {
        return this.whatsappService.deleteTemplate(req.user.orgId, id, templateName);
    }
    async syncAccount(req, id) {
        return this.whatsappService.syncAccount(req.user.orgId, id);
    }
    async disconnectAccount(req, id) {
        return this.whatsappService.disconnectAccount(req.user.orgId, id);
    }
    async getSignupConfig() {
        return {
            appId: process.env.WHATSAPP_APP_ID,
            apiVersion: process.env.WHATSAPP_API_VERSION || 'v22.0',
        };
    }
};
exports.WhatsappController = WhatsappController;
__decorate([
    (0, common_1.Post)('account'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.UserRole.ORG_ADMIN),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "connectAccount", null);
__decorate([
    (0, common_1.Get)('accounts'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "listAccounts", null);
__decorate([
    (0, common_1.Get)('accounts/:id/templates'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)('sync')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "getTemplates", null);
__decorate([
    (0, common_1.Post)('accounts/:id/templates'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "createTemplate", null);
__decorate([
    (0, common_1.Post)('accounts/:id/templates/upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "uploadTemplateMedia", null);
__decorate([
    (0, common_1.Patch)('accounts/:id/templates/:templateId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('templateId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "updateTemplate", null);
__decorate([
    (0, common_1.Delete)('accounts/:id/templates/:templateName'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('templateName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "deleteTemplate", null);
__decorate([
    (0, common_1.Post)('sync/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "syncAccount", null);
__decorate([
    (0, common_1.Post)('disconnect/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "disconnectAccount", null);
__decorate([
    (0, common_1.Get)('config'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "getSignupConfig", null);
exports.WhatsappController = WhatsappController = __decorate([
    (0, common_1.Controller)({
        path: 'whatsapp',
        version: '1',
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, whatsapp_account_guard_1.WhatsAppAccountGuard),
    (0, permissions_decorator_1.Permissions)('view:whatsapp-account'),
    __metadata("design:paramtypes", [whatsapp_service_1.WhatsappService])
], WhatsappController);
//# sourceMappingURL=whatsapp.controller.js.map