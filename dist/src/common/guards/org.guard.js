"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationGuard = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let OrganizationGuard = class OrganizationGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user.role === client_1.UserRole.SUPER_ADMIN) {
            return true;
        }
        const orgId = request.params.orgId || request.body.orgId || request.query.orgId;
        if (!orgId) {
            return true;
        }
        if (user.orgId !== orgId) {
            throw new common_1.ForbiddenException('You do not have access to this organization.');
        }
        return true;
    }
};
exports.OrganizationGuard = OrganizationGuard;
exports.OrganizationGuard = OrganizationGuard = __decorate([
    (0, common_1.Injectable)()
], OrganizationGuard);
//# sourceMappingURL=org.guard.js.map