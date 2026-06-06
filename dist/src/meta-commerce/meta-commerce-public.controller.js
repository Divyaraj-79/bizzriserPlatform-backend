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
exports.MetaCommercePublicController = void 0;
const common_1 = require("@nestjs/common");
const meta_commerce_service_1 = require("./meta-commerce.service");
let MetaCommercePublicController = class MetaCommercePublicController {
    metaCommerceService;
    constructor(metaCommerceService) {
        this.metaCommerceService = metaCommerceService;
    }
    async getCheckoutSession(id) {
        return this.metaCommerceService.getCheckoutSession(id);
    }
    async applyCoupon(id, code) {
        return this.metaCommerceService.applyCoupon(id, code);
    }
};
exports.MetaCommercePublicController = MetaCommercePublicController;
__decorate([
    (0, common_1.Get)('orders/:id/checkout'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MetaCommercePublicController.prototype, "getCheckoutSession", null);
__decorate([
    (0, common_1.Post)('orders/:id/apply-coupon'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MetaCommercePublicController.prototype, "applyCoupon", null);
exports.MetaCommercePublicController = MetaCommercePublicController = __decorate([
    (0, common_1.Controller)('public-commerce'),
    __metadata("design:paramtypes", [meta_commerce_service_1.MetaCommerceService])
], MetaCommercePublicController);
//# sourceMappingURL=meta-commerce-public.controller.js.map