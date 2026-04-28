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
const roles_guard_1 = require("../../common/guards/roles.guard");
const permissions_decorator_1 = require("../../common/decorators/permissions.decorator");
let ContactsController = class ContactsController {
    contactsService;
    constructor(contactsService) {
        this.contactsService = contactsService;
    }
    async create(req, data) {
        return this.contactsService.createOrUpdate(req.user.orgId, data.phone, data);
    }
    async bulkCreate(req, data) {
        return this.contactsService.bulkCreateOrUpdate(req.user.orgId, data.contacts);
    }
    async findAll(req, page, limit, search, status, tag) {
        let effectiveOrgId = req.user.orgId;
        if (!effectiveOrgId && req.user.userId) {
            try {
                const fullUser = await this.contactsService.prisma.user.findUnique({
                    where: { id: req.user.userId },
                    select: { organizationId: true, role: true }
                });
                effectiveOrgId = fullUser?.organizationId;
            }
            catch (e) { }
        }
        let result = await this.contactsService.findAll(effectiveOrgId, {
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 50,
            search,
            status,
            tag,
        });
        const isSuperAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'superadmin';
        if (result.total === 0 && isSuperAdmin) {
            const globalResults = await this.contactsService.findAll(undefined, {
                page: page ? parseInt(page, 10) : 1,
                limit: limit ? parseInt(limit, 10) : 50,
                search,
                status,
                tag,
            });
            result = {
                ...globalResults,
                globalCount: globalResults.total
            };
        }
        return result;
    }
    async update(req, id, data) {
        return this.contactsService.updateContact(req.user.orgId, id, data);
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
    async getImportStatus(jobId) {
        return this.contactsService.getImportStatus(jobId);
    }
};
exports.ContactsController = ContactsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('bulk'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "bulkCreate", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('search')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('tag')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "update", null);
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
__decorate([
    (0, common_1.Get)('import/status/:jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ContactsController.prototype, "getImportStatus", null);
exports.ContactsController = ContactsController = __decorate([
    (0, common_1.Controller)('contacts'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, permissions_decorator_1.Permissions)('view:contacts'),
    __metadata("design:paramtypes", [contacts_service_1.ContactsService])
], ContactsController);
//# sourceMappingURL=contacts.controller.js.map