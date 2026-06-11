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
exports.ContactNotesController = void 0;
const common_1 = require("@nestjs/common");
const contact_notes_service_1 = require("./contact-notes.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
let ContactNotesController = class ContactNotesController {
    contactNotesService;
    constructor(contactNotesService) {
        this.contactNotesService = contactNotesService;
    }
    async findAll(req, contactId) {
        return this.contactNotesService.findAll(req.user.orgId, contactId);
    }
    async create(req, contactId, body) {
        return this.contactNotesService.create(req.user.orgId, contactId, req.user.userId, body);
    }
    async update(req, noteId, body) {
        return this.contactNotesService.update(req.user.orgId, noteId, body);
    }
    async remove(req, noteId) {
        return this.contactNotesService.remove(req.user.orgId, noteId);
    }
};
exports.ContactNotesController = ContactNotesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('contactId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ContactNotesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('contactId')),
    __param(2, (0, common_1.Body)('body')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ContactNotesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':noteId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('noteId')),
    __param(2, (0, common_1.Body)('body')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ContactNotesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':noteId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('noteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ContactNotesController.prototype, "remove", null);
exports.ContactNotesController = ContactNotesController = __decorate([
    (0, common_1.Controller)('contacts/:contactId/notes'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, permissions_decorator_1.Permissions)('view:contacts'),
    __metadata("design:paramtypes", [contact_notes_service_1.ContactNotesService])
], ContactNotesController);
//# sourceMappingURL=contact-notes.controller.js.map