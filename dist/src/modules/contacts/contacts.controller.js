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
exports.ContactsController = void 0;
const common_1 = require("@nestjs/common");
const contacts_service_1 = require("./contacts.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let ContactsController = class ContactsController {
    contactsService;
    constructor(contactsService) {
        this.contactsService = contactsService;
    }
    async findAll(req) {
        return this.contactsService.findAll(req.user.orgId);
    }
    async getTagsAnalytics(req) {
        return this.contactsService.getTagsAnalytics(req.user.orgId);
    }
    async bulkAddTags(req, body) {
        return this.contactsService.bulkAddTags(req.user.orgId, body.contactIds, body.tags);
    }
    async bulkRemoveTags(req, body) {
        return this.contactsService.bulkRemoveTags(req.user.orgId, body.contactIds, body.tags);
    }
    async bulkDelete(req, body) {
        return this.contactsService.deleteContacts(req.user.orgId, body.contactIds);
    }
};
exports.ContactsController = ContactsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('tags'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "getTagsAnalytics", null);
__decorate([
    (0, common_1.Post)('bulk-tags'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "bulkAddTags", null);
__decorate([
    (0, common_1.Delete)('bulk-remove-tags'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "bulkRemoveTags", null);
__decorate([
    (0, common_1.Delete)('bulk-delete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "bulkDelete", null);
exports.ContactsController = ContactsController = __decorate([
    (0, common_1.Controller)('contacts'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [contacts_service_1.ContactsService])
], ContactsController);
//# sourceMappingURL=contacts.controller.js.map