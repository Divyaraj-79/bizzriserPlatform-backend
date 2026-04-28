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
var FlowDelayProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowDelayProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../../../prisma/prisma.service");
const flow_executor_service_1 = require("./flow-executor.service");
const client_1 = require("@prisma/client");
let FlowDelayProcessor = FlowDelayProcessor_1 = class FlowDelayProcessor {
    prisma;
    flowExecutor;
    logger = new common_1.Logger(FlowDelayProcessor_1.name);
    constructor(prisma, flowExecutor) {
        this.prisma = prisma;
        this.flowExecutor = flowExecutor;
    }
    async handleResumeAfterDelay(job) {
        const { sessionId, nextNodeId, organizationId, accountId, contactId } = job.data;
        this.logger.log(`Resuming session ${sessionId} after delay, advancing to node ${nextNodeId}`);
        try {
            const session = await this.prisma.chatbotSession.findUnique({ where: { id: sessionId } });
            if (!session || session.status === client_1.ChatbotSessionStatus.COMPLETED) {
                this.logger.log(`Session ${sessionId} is already completed. Skipping delay resume.`);
                return;
            }
            const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
            if (!contact)
                return;
            const chatbot = await this.prisma.chatbot.findUnique({ where: { id: session.chatbotId } });
            if (!chatbot)
                return;
            const flowData = chatbot.flowData;
            const allNodes = flowData?.nodes || [];
            const allEdges = flowData?.edges || [];
            const nextNode = allNodes.find((n) => n.id === nextNodeId);
            if (!nextNode) {
                await this.prisma.chatbotSession.update({
                    where: { id: sessionId },
                    data: { status: client_1.ChatbotSessionStatus.COMPLETED },
                });
                return;
            }
            const activeSession = await this.prisma.chatbotSession.update({
                where: { id: sessionId },
                data: { status: client_1.ChatbotSessionStatus.ACTIVE, waitingForInput: false, currentNodeId: nextNodeId },
            });
            await this.flowExecutor['executeNode'](activeSession, nextNode, allEdges, allNodes, contact, {});
        }
        catch (err) {
            this.logger.error(`Error resuming delayed session ${sessionId}: ${err.message}`);
            throw err;
        }
    }
};
exports.FlowDelayProcessor = FlowDelayProcessor;
__decorate([
    (0, bull_1.Process)('resume-after-delay'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], FlowDelayProcessor.prototype, "handleResumeAfterDelay", null);
exports.FlowDelayProcessor = FlowDelayProcessor = FlowDelayProcessor_1 = __decorate([
    (0, bull_1.Processor)('flow-delays'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        flow_executor_service_1.FlowExecutorService])
], FlowDelayProcessor);
//# sourceMappingURL=flow-delay.processor.js.map