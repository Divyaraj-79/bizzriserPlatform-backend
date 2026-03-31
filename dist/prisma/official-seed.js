"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const passwordHash = await bcrypt.hash('password123', 10);
    const org = await prisma.organization.upsert({
        where: { slug: 'bizzriser' },
        update: {},
        create: {
            name: 'BizzRiser Internal',
            slug: 'bizzriser',
        },
    });
    await prisma.user.upsert({
        where: { email: 'superadmin@bizzriser.com' },
        update: { role: client_1.UserRole.SUPER_ADMIN },
        create: {
            email: 'superadmin@bizzriser.com',
            passwordHash,
            firstName: 'BizzRiser',
            lastName: 'Admin',
            role: client_1.UserRole.SUPER_ADMIN,
            organizationId: org.id,
        },
    });
    await prisma.user.upsert({
        where: { email: 'admin@bizzriser.com' },
        update: { role: client_1.UserRole.ORG_ADMIN },
        create: {
            email: 'admin@bizzriser.com',
            passwordHash,
            firstName: 'Default',
            lastName: 'Business',
            role: client_1.UserRole.ORG_ADMIN,
            organizationId: org.id,
        },
    });
    console.log('--- SEEDING COMPLETE ---');
    console.log('Super Admin: superadmin@bizzriser.com / password123');
    console.log('Org Admin:   admin@bizzriser.com / password123');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=official-seed.js.map