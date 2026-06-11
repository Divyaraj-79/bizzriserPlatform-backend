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
exports.SequencesController = void 0;
const common_1 = require("@nestjs/common");
const sequences_service_1 = require("./sequences.service");
const sequences_dto_1 = require("./dto/sequences.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
let SequencesController = class SequencesController {
    sequencesService;
    constructor(sequencesService) {
        this.sequencesService = sequencesService;
    }
    async getSequences(req) {
        return this.sequencesService.getSequences(req.user.organizationId);
    }
    async getSequence(req, id) {
        return this.sequencesService.getSequence(req.user.organizationId, id);
    }
    async createSequence(req, data) {
        return this.sequencesService.createSequence(req.user.organizationId, data);
    }
    async updateSequence(req, id, data) {
        return this.sequencesService.updateSequence(req.user.organizationId, id, data);
    }
    async deleteSequence(req, id) {
        return this.sequencesService.deleteSequence(req.user.organizationId, id);
    }
    async createStep(req, id, data) {
        return this.sequencesService.createStep(req.user.organizationId, id, data);
    }
    async updateStep(req, sequenceId, stepId, data) {
        return this.sequencesService.updateStep(req.user.organizationId, sequenceId, stepId, data);
    }
    async deleteStep(req, sequenceId, stepId) {
        return this.sequencesService.deleteStep(req.user.organizationId, sequenceId, stepId);
    }
    async enrollContact(req, sequenceId, contactId, accountId) {
        return this.sequencesService.enrollContact(req.user.organizationId, sequenceId, contactId, accountId);
    }
};
exports.SequencesController = SequencesController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)('sequences:view'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "getSequences", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('sequences:view'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "getSequence", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('sequences:create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, sequences_dto_1.CreateSequenceDto]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "createSequence", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('sequences:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, sequences_dto_1.UpdateSequenceDto]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "updateSequence", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('sequences:delete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "deleteSequence", null);
__decorate([
    (0, common_1.Post)(':id/steps'),
    (0, permissions_decorator_1.Permissions)('sequences:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, sequences_dto_1.CreateSequenceStepDto]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "createStep", null);
__decorate([
    (0, common_1.Patch)(':id/steps/:stepId'),
    (0, permissions_decorator_1.Permissions)('sequences:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('stepId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "updateStep", null);
__decorate([
    (0, common_1.Delete)(':id/steps/:stepId'),
    (0, permissions_decorator_1.Permissions)('sequences:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('stepId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "deleteStep", null);
__decorate([
    (0, common_1.Post)(':id/enroll'),
    (0, permissions_decorator_1.Permissions)('sequences:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('contactId')),
    __param(3, (0, common_1.Body)('accountId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], SequencesController.prototype, "enrollContact", null);
exports.SequencesController = SequencesController = __decorate([
    (0, common_1.Controller)('sequences'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [sequences_service_1.SequencesService])
], SequencesController);
//# sourceMappingURL=sequences.controller.js.map