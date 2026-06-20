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
var DataRetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataRetentionService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
let DataRetentionService = DataRetentionService_1 = class DataRetentionService {
    prisma;
    logger = new common_1.Logger(DataRetentionService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async handleDataRetention() {
        this.logger.log('Starting data retention cleanup job...');
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const result = await this.prisma.message.deleteMany({
                where: {
                    createdAt: {
                        lt: ninetyDaysAgo,
                    },
                },
            });
            this.logger.log(`Data retention cleanup completed. Deleted ${result.count} old messages.`);
        }
        catch (error) {
            this.logger.error('Failed to run data retention cleanup job', error.stack);
        }
    }
};
exports.DataRetentionService = DataRetentionService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DataRetentionService.prototype, "handleDataRetention", null);
exports.DataRetentionService = DataRetentionService = DataRetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DataRetentionService);
//# sourceMappingURL=data-retention.service.js.map