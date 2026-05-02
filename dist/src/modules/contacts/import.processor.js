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
var ImportProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportProcessor = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const contacts_service_1 = require("./contacts.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
let ImportProcessor = ImportProcessor_1 = class ImportProcessor {
    contactsService;
    realtimeGateway;
    logger = new common_1.Logger(ImportProcessor_1.name);
    constructor(contactsService, realtimeGateway) {
        this.contactsService = contactsService;
        this.realtimeGateway = realtimeGateway;
    }
    onModuleInit() {
        this.logger.log('🚀 Bulk Import Processor successfully initialized and connected to Redis.');
    }
    async handleImport(job) {
        const { orgId, contacts, duplicatesRemoved } = job.data;
        const total = contacts.length;
        const jobId = job.id;
        this.logger.log(`📥 Starting background import for ${total} contacts (Org: ${orgId}, Job ID: ${jobId}, Duplicates: ${duplicatesRemoved || 0})`);
        try {
            const setProgress = async (val) => {
                if (typeof job.updateProgress === 'function')
                    await job.updateProgress(val);
                else if (typeof job.progress === 'function')
                    await job.progress(val);
                const stats = typeof val === 'object' ? val : { progress: val, current: val === 100 ? total : 0, total };
                this.realtimeGateway.emitImportProgress(orgId, jobId, { ...stats, duplicatesRemoved });
            };
            await setProgress({ progress: 1, current: 0, total });
            await this.contactsService.atomicBulkImport(orgId, contacts, async (stats) => {
                const p = Math.max(1, Math.floor((stats.current / stats.total) * 100));
                await setProgress({ ...stats, progress: p });
            });
            await setProgress({ progress: 100, current: total, total });
            this.logger.log(`✅ Import completed successfully for Org: ${orgId}`);
            return {
                success: true,
                count: total,
                duplicatesRemoved,
                newCount: job.data.newCount || total
            };
        }
        catch (err) {
            this.logger.error(`❌ Import failed for Org: ${orgId}: ${err.message}`);
            try {
                await job.updateProgress({ progress: 0, error: err.message, status: 'FAILED' });
                this.realtimeGateway.emitImportProgress(orgId, jobId, { progress: 0, error: err.message, status: 'FAILED' });
            }
            catch (e) { }
            throw err;
        }
    }
};
exports.ImportProcessor = ImportProcessor;
__decorate([
    (0, bull_1.Process)('import-contacts'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImportProcessor.prototype, "handleImport", null);
exports.ImportProcessor = ImportProcessor = ImportProcessor_1 = __decorate([
    (0, bull_1.Processor)('contact-import'),
    __metadata("design:paramtypes", [contacts_service_1.ContactsService,
        realtime_gateway_1.RealtimeGateway])
], ImportProcessor);
//# sourceMappingURL=import.processor.js.map