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
var SequenceExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceExecutorService = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const client_1 = require("@prisma/client");
let SequenceExecutorService = SequenceExecutorService_1 = class SequenceExecutorService {
    prisma;
    whatsappService;
    logger = new common_1.Logger(SequenceExecutorService_1.name);
    constructor(prisma, whatsappService) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
    }
    async handleExecuteStep(job) {
        const { enrollmentId } = job.data;
        const enrollment = await this.prisma.sequenceEnrollment.findUnique({
            where: { id: enrollmentId },
            include: {
                sequence: { include: { steps: { orderBy: { orderIndex: 'asc' } } } },
                contact: true,
            },
        });
        if (!enrollment || enrollment.status !== client_1.SequenceEnrollmentStatus.ACTIVE) {
            return;
        }
        const { sequence, contact } = enrollment;
        const currentStep = sequence.steps[enrollment.currentStepIndex];
        if (!currentStep) {
            await this.markCompleted(enrollment.id);
            return;
        }
        try {
            this.logger.log(`Executing sequence step ${currentStep.id} for enrollment ${enrollment.id}`);
            if (currentStep.actionType === 'SEND_TEXT') {
                const text = currentStep.actionData.text;
                if (text) {
                    const message = text.replace('{{contact.firstName}}', contact.firstName || '');
                    await this.whatsappService.sendTextMessage(enrollment.organizationId, enrollment.accountId, contact.phone, message);
                }
            }
            else if (currentStep.actionType === 'SEND_TEMPLATE') {
                const templateName = currentStep.actionData.templateName;
                const language = currentStep.actionData.language || 'en_US';
                const components = currentStep.actionData.components || [];
                await this.whatsappService.sendTemplateMessage(enrollment.organizationId, enrollment.accountId, contact.phone, templateName, language, components);
            }
            const nextIndex = enrollment.currentStepIndex + 1;
            const nextStep = sequence.steps[nextIndex];
            if (nextStep) {
                await this.prisma.sequenceEnrollment.update({
                    where: { id: enrollment.id },
                    data: {
                        currentStepIndex: nextIndex,
                        nextExecuteAt: this.calculateDelay(new Date(), nextStep.delayAmount, nextStep.delayUnit),
                    },
                });
            }
            else {
                await this.markCompleted(enrollment.id);
            }
        }
        catch (error) {
            this.logger.error(`Failed to execute sequence step: ${error.message}`);
            await this.prisma.sequenceEnrollment.update({
                where: { id: enrollment.id },
                data: { status: client_1.SequenceEnrollmentStatus.PAUSED },
            });
        }
    }
    async markCompleted(enrollmentId) {
        await this.prisma.sequenceEnrollment.update({
            where: { id: enrollmentId },
            data: {
                status: client_1.SequenceEnrollmentStatus.COMPLETED,
                completedAt: new Date(),
                nextExecuteAt: null,
            },
        });
    }
    calculateDelay(from, delayAmount, delayUnit) {
        const nextDate = new Date(from);
        switch (delayUnit) {
            case 'seconds':
                nextDate.setSeconds(nextDate.getSeconds() + delayAmount);
                break;
            case 'minutes':
                nextDate.setMinutes(nextDate.getMinutes() + delayAmount);
                break;
            case 'hours':
                nextDate.setHours(nextDate.getHours() + delayAmount);
                break;
            case 'days':
                nextDate.setDate(nextDate.getDate() + delayAmount);
                break;
        }
        return nextDate;
    }
};
exports.SequenceExecutorService = SequenceExecutorService;
__decorate([
    (0, bull_1.Process)('execute-step'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], SequenceExecutorService.prototype, "handleExecuteStep", null);
exports.SequenceExecutorService = SequenceExecutorService = SequenceExecutorService_1 = __decorate([
    (0, bull_1.Processor)('sequences'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService])
], SequenceExecutorService);
//# sourceMappingURL=sequence-executor.service.js.map