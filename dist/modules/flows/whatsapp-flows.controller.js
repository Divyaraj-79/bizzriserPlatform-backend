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
exports.WhatsAppFlowsController = void 0;
const common_1 = require("@nestjs/common");
const whatsapp_flows_service_1 = require("./whatsapp-flows.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
let WhatsAppFlowsController = class WhatsAppFlowsController {
    flowsService;
    constructor(flowsService) {
        this.flowsService = flowsService;
    }
    async createFlow(req, body) {
        return this.flowsService.createFlow(req.user.orgId, body);
    }
    async listFlows(req) {
        return this.flowsService.listFlows(req.user.orgId);
    }
    async getFlow(req, id) {
        return this.flowsService.getFlow(req.user.orgId, id);
    }
    async updateFlow(req, id, body) {
        return this.flowsService.updateFlow(req.user.orgId, id, body);
    }
    async deleteFlow(req, id) {
        return this.flowsService.deleteFlow(req.user.orgId, id);
    }
    async getSubmissions(req, id) {
        return this.flowsService.getSubmissions(req.user.orgId, id);
    }
    async exportFlow(req, id, res) {
        const buffer = await this.flowsService.exportSubmissionsToExcel(req.user.orgId, id);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="flow-submissions-${id}.xlsx"`,
            'Content-Length': buffer.byteLength,
        });
        res.end(buffer);
    }
    async publishFlow(req, id, body) {
        return this.flowsService.publishFlow(req.user.orgId, id, body.accountId);
    }
};
exports.WhatsAppFlowsController = WhatsAppFlowsController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('manage:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "createFlow", null);
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)('view:flows'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "listFlows", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('view:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "getFlow", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, permissions_decorator_1.Permissions)('manage:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "updateFlow", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('manage:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "deleteFlow", null);
__decorate([
    (0, common_1.Get)(':id/submissions'),
    (0, permissions_decorator_1.Permissions)('view:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "getSubmissions", null);
__decorate([
    (0, common_1.Get)(':id/export'),
    (0, permissions_decorator_1.Permissions)('view:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "exportFlow", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, permissions_decorator_1.Permissions)('manage:flows'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WhatsAppFlowsController.prototype, "publishFlow", null);
exports.WhatsAppFlowsController = WhatsAppFlowsController = __decorate([
    (0, common_1.Controller)({
        path: 'flows',
        version: '1',
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [whatsapp_flows_service_1.WhatsAppFlowsService])
], WhatsAppFlowsController);
//# sourceMappingURL=whatsapp-flows.controller.js.map