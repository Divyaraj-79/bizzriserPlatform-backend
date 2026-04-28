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
exports.ChatbotsController = void 0;
const common_1 = require("@nestjs/common");
const chatbots_service_1 = require("./chatbots.service");
const create_chatbot_dto_1 = require("./dto/create-chatbot.dto");
const update_chatbot_dto_1 = require("./dto/update-chatbot.dto");
const test_request_dto_1 = require("./dto/test-request.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
let ChatbotsController = class ChatbotsController {
    chatbotsService;
    constructor(chatbotsService) {
        this.chatbotsService = chatbotsService;
    }
    findAll(req) {
        return this.chatbotsService.findAll(req.user.orgId);
    }
    create(req, dto) {
        return this.chatbotsService.create(req.user.orgId, dto);
    }
    findOne(req, id) {
        return this.chatbotsService.findOne(req.user.orgId, id);
    }
    update(req, id, dto) {
        return this.chatbotsService.update(req.user.orgId, id, dto);
    }
    remove(req, id) {
        return this.chatbotsService.remove(req.user.orgId, id);
    }
    activate(req, id) {
        return this.chatbotsService.activate(req.user.orgId, id);
    }
    deactivate(req, id) {
        return this.chatbotsService.deactivate(req.user.orgId, id);
    }
    clone(req, id) {
        return this.chatbotsService.clone(req.user.orgId, id);
    }
    testRequest(dto) {
        return this.chatbotsService.executeTestRequest(dto);
    }
};
exports.ChatbotsController = ChatbotsController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)('chatbots:view'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('chatbots:create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_chatbot_dto_1.CreateChatbotDto]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('chatbots:view'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('chatbots:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_chatbot_dto_1.UpdateChatbotDto]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, permissions_decorator_1.Permissions)('chatbots:delete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/activate'),
    (0, permissions_decorator_1.Permissions)('chatbots:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)(':id/deactivate'),
    (0, permissions_decorator_1.Permissions)('chatbots:edit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "deactivate", null);
__decorate([
    (0, common_1.Post)(':id/clone'),
    (0, permissions_decorator_1.Permissions)('chatbots:create'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "clone", null);
__decorate([
    (0, common_1.Post)('test-request'),
    (0, permissions_decorator_1.Permissions)('chatbots:edit'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [test_request_dto_1.TestRequestDto]),
    __metadata("design:returntype", void 0)
], ChatbotsController.prototype, "testRequest", null);
exports.ChatbotsController = ChatbotsController = __decorate([
    (0, common_1.Controller)('chatbots'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [chatbots_service_1.ChatbotsService])
], ChatbotsController);
//# sourceMappingURL=chatbots.controller.js.map