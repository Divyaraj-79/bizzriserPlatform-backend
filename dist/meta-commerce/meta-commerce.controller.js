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
exports.MetaCommerceController = void 0;
const common_1 = require("@nestjs/common");
const meta_commerce_service_1 = require("./meta-commerce.service");
let MetaCommerceController = class MetaCommerceController {
    metaCommerceService;
    constructor(metaCommerceService) {
        this.metaCommerceService = metaCommerceService;
    }
    getOAuthUrl() {
        return this.metaCommerceService.generateOAuthUrl();
    }
    async handleOAuthCallback(code, req) {
        const organizationId = req.user?.organizationId || 'default-org-id';
        return this.metaCommerceService.handleOAuthCallback(code, organizationId);
    }
    async getBusinesses(req) {
        const organizationId = req.user?.organizationId || 'default-org-id';
        return this.metaCommerceService.getBusinesses(organizationId);
    }
    async getCatalogs(businessId, req) {
        const organizationId = req.user?.organizationId || 'default-org-id';
        return this.metaCommerceService.getCatalogs(businessId, organizationId);
    }
    async getProducts(catalogId, req) {
        const organizationId = req.user?.organizationId || 'default-org-id';
        return this.metaCommerceService.getProducts(catalogId, organizationId);
    }
};
exports.MetaCommerceController = MetaCommerceController;
__decorate([
    (0, common_1.Get)('oauth/url'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MetaCommerceController.prototype, "getOAuthUrl", null);
__decorate([
    (0, common_1.Post)('oauth/callback'),
    __param(0, (0, common_1.Body)('code')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MetaCommerceController.prototype, "handleOAuthCallback", null);
__decorate([
    (0, common_1.Get)('businesses'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MetaCommerceController.prototype, "getBusinesses", null);
__decorate([
    (0, common_1.Get)('businesses/:businessId/catalogs'),
    __param(0, (0, common_1.Param)('businessId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MetaCommerceController.prototype, "getCatalogs", null);
__decorate([
    (0, common_1.Get)('catalogs/:catalogId/products'),
    __param(0, (0, common_1.Param)('catalogId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MetaCommerceController.prototype, "getProducts", null);
exports.MetaCommerceController = MetaCommerceController = __decorate([
    (0, common_1.Controller)('meta-commerce'),
    __metadata("design:paramtypes", [meta_commerce_service_1.MetaCommerceService])
], MetaCommerceController);
//# sourceMappingURL=meta-commerce.controller.js.map