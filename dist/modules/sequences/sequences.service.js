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
var SequencesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequencesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const bull_1 = require("@nestjs/bull");
const bullmq_1 = require("bullmq");
let SequencesService = SequencesService_1 = class SequencesService {
    prisma;
    sequencesQueue;
    logger = new common_1.Logger(SequencesService_1.name);
    constructor(prisma, sequencesQueue) {
        this.prisma = prisma;
        this.sequencesQueue = sequencesQueue;
    }
    onModuleInit() {
        this.startSequencePoller();
    }
    startSequencePoller() {
        setInterval(async () => {
            try {
                const dueEnrollments = await this.prisma.sequenceEnrollment.findMany({
                    where: {
                        status: client_1.SequenceEnrollmentStatus.ACTIVE,
                        nextExecuteAt: { lte: new Date() },
                    },
                    take: 50,
                });
                for (const enrollment of dueEnrollments) {
                    await this.prisma.sequenceEnrollment.update({
                        where: { id: enrollment.id },
                        data: { nextExecuteAt: null },
                    });
                    await this.sequencesQueue.add('execute-step', { enrollmentId: enrollment.id });
                }
            }
            catch (error) {
                this.logger.error('Error polling sequences: ' + error.message);
            }
        }, 30000);
    }
    async createSequence(orgId, data) {
        return this.prisma.sequence.create({
            data: {
                organizationId: orgId,
                ...data,
            },
        });
    }
    async getSequences(orgId) {
        return this.prisma.sequence.findMany({
            where: { organizationId: orgId },
            include: {
                _count: {
                    select: { steps: true, enrollments: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getSequence(orgId, id) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id, organizationId: orgId },
            include: {
                steps: { orderBy: { orderIndex: 'asc' } },
                _count: { select: { enrollments: true } },
            },
        });
        if (!sequence)
            throw new common_1.NotFoundException('Sequence not found');
        return sequence;
    }
    async updateSequence(orgId, id, data) {
        return this.prisma.sequence.update({
            where: { id, organizationId: orgId },
            data,
        });
    }
    async deleteSequence(orgId, id) {
        return this.prisma.sequence.delete({
            where: { id, organizationId: orgId },
        });
    }
    async createStep(orgId, sequenceId, data) {
        await this.getSequence(orgId, sequenceId);
        return this.prisma.sequenceStep.create({
            data: {
                sequenceId,
                ...data,
            },
        });
    }
    async updateStep(orgId, sequenceId, stepId, data) {
        await this.getSequence(orgId, sequenceId);
        return this.prisma.sequenceStep.update({
            where: { id: stepId, sequenceId },
            data,
        });
    }
    async deleteStep(orgId, sequenceId, stepId) {
        await this.getSequence(orgId, sequenceId);
        return this.prisma.sequenceStep.delete({
            where: { id: stepId, sequenceId },
        });
    }
    async enrollContact(orgId, sequenceId, contactId, accountId) {
        const sequence = await this.getSequence(orgId, sequenceId);
        if (sequence.status !== client_1.SequenceStatus.ACTIVE) {
            throw new Error('Sequence is not active');
        }
        const firstStep = sequence.steps[0];
        if (!firstStep)
            throw new Error('Sequence has no steps');
        const nextExecuteAt = this.calculateNextExecution(new Date(), firstStep.delayAmount, firstStep.delayUnit);
        return this.prisma.sequenceEnrollment.create({
            data: {
                organizationId: orgId,
                sequenceId,
                contactId,
                accountId,
                currentStepIndex: 0,
                nextExecuteAt,
                status: client_1.SequenceEnrollmentStatus.ACTIVE,
            },
        });
    }
    async cancelEnrollment(orgId, enrollmentId) {
        return this.prisma.sequenceEnrollment.update({
            where: { id: enrollmentId, organizationId: orgId },
            data: { status: client_1.SequenceEnrollmentStatus.CANCELLED },
        });
    }
    calculateNextExecution(from, delayAmount, delayUnit) {
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
            default:
                nextDate.setMinutes(nextDate.getMinutes() + delayAmount);
        }
        return nextDate;
    }
};
exports.SequencesService = SequencesService;
exports.SequencesService = SequencesService = SequencesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('sequences')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_1.Queue])
], SequencesService);
//# sourceMappingURL=sequences.service.js.map