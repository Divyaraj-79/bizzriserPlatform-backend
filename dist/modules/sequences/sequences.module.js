"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequencesModule = void 0;
const common_1 = require("@nestjs/common");
const sequences_controller_1 = require("./sequences.controller");
const sequences_service_1 = require("./sequences.service");
const sequence_executor_service_1 = require("./sequence-executor.service");
const prisma_module_1 = require("../../prisma/prisma.module");
const bull_1 = require("@nestjs/bull");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
let SequencesModule = class SequencesModule {
};
exports.SequencesModule = SequencesModule;
exports.SequencesModule = SequencesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            whatsapp_module_1.WhatsappModule,
            bull_1.BullModule.registerQueue({
                name: 'sequences',
            }),
        ],
        controllers: [sequences_controller_1.SequencesController],
        providers: [sequences_service_1.SequencesService, sequence_executor_service_1.SequenceExecutorService],
        exports: [sequences_service_1.SequencesService],
    })
], SequencesModule);
//# sourceMappingURL=sequences.module.js.map