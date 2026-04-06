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
let ImportProcessor = ImportProcessor_1 = class ImportProcessor {
    contactsService;
    logger = new common_1.Logger(ImportProcessor_1.name);
    constructor(contactsService) {
        this.contactsService = contactsService;
    }
    onModuleInit() {
        this.logger.log('🚀 Bulk Import Processor successfully initialized and connected to Redis.');
    }
    async handleImport(job) {
        const { orgId, contacts } = job.data;
        const total = contacts.length;
        this.logger.log(`📥 Starting background import for ${total} contacts (Org: ${orgId}, Job ID: ${job.id})`);
        try {
            await job.progress(1);
            await this.contactsService.atomicBulkImport(orgId, contacts, async (p) => {
                const scaledProgress = 5 + Math.floor(p * 0.9);
                await job.progress(scaledProgress);
            });
            await job.progress(100);
            this.logger.log(`✅ Import completed successfully for Org: ${orgId}`);
            return { success: true, count: total };
        }
        catch (err) {
            this.logger.error(`❌ Import failed for Org: ${orgId}: ${err.message}`);
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
    __metadata("design:paramtypes", [contacts_service_1.ContactsService])
], ImportProcessor);
//# sourceMappingURL=import.processor.js.map