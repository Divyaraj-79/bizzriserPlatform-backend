"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotsModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const chatbots_service_1 = require("./chatbots.service");
const chatbots_controller_1 = require("./chatbots.controller");
const prisma_module_1 = require("../../prisma/prisma.module");
const flow_executor_service_1 = require("./executor/flow-executor.service");
const flow_delay_processor_1 = require("./executor/flow-delay.processor");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
let ChatbotsModule = class ChatbotsModule {
};
exports.ChatbotsModule = ChatbotsModule;
exports.ChatbotsModule = ChatbotsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            whatsapp_module_1.WhatsappModule,
            bull_1.BullModule.registerQueue({ name: 'flow-delays' }),
        ],
        controllers: [chatbots_controller_1.ChatbotsController],
        providers: [chatbots_service_1.ChatbotsService, flow_executor_service_1.FlowExecutorService, flow_delay_processor_1.FlowDelayProcessor],
        exports: [chatbots_service_1.ChatbotsService, flow_executor_service_1.FlowExecutorService],
    })
], ChatbotsModule);
//# sourceMappingURL=chatbots.module.js.map