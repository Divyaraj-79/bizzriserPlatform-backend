import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSequenceDto, UpdateSequenceDto, CreateSequenceStepDto } from './dto/sequences.dto';
import { SequenceEnrollmentStatus, SequenceStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';

@Injectable()
export class SequencesService implements OnModuleInit {
  private readonly logger = new Logger(SequencesService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('sequences') private sequencesQueue: Queue,
  ) {}

  onModuleInit() {
    this.startSequencePoller();
  }

  private startSequencePoller() {
    setInterval(async () => {
      try {
        const dueEnrollments = await this.prisma.sequenceEnrollment.findMany({
          where: {
            status: SequenceEnrollmentStatus.ACTIVE,
            nextExecuteAt: { lte: new Date() },
          },
          take: 50,
        });

        for (const enrollment of dueEnrollments) {
          // Immediately mark as processing to prevent duplicate processing
          await this.prisma.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { nextExecuteAt: null }, // clear nextExecuteAt so it's not picked up again while processing
          });

          await this.sequencesQueue.add('execute-step', { enrollmentId: enrollment.id });
        }
      } catch (error) {
        this.logger.error('Error polling sequences: ' + error.message);
      }
    }, 30000); // 30 seconds
  }

  async createSequence(orgId: string, data: CreateSequenceDto) {
    return this.prisma.sequence.create({
      data: {
        organizationId: orgId,
        ...data,
      },
    });
  }

  async getSequences(orgId: string) {
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

  async getSequence(orgId: string, id: string) {
    const sequence = await this.prisma.sequence.findUnique({
      where: { id, organizationId: orgId },
      include: {
        steps: { orderBy: { orderIndex: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    });

    if (!sequence) throw new NotFoundException('Sequence not found');
    return sequence;
  }

  async updateSequence(orgId: string, id: string, data: UpdateSequenceDto) {
    return this.prisma.sequence.update({
      where: { id, organizationId: orgId },
      data,
    });
  }

  async deleteSequence(orgId: string, id: string) {
    return this.prisma.sequence.delete({
      where: { id, organizationId: orgId },
    });
  }

  async createStep(orgId: string, sequenceId: string, data: CreateSequenceStepDto) {
    await this.getSequence(orgId, sequenceId); // ensure existence
    return this.prisma.sequenceStep.create({
      data: {
        sequenceId,
        ...data,
      },
    });
  }

  async updateStep(orgId: string, sequenceId: string, stepId: string, data: Partial<CreateSequenceStepDto>) {
    await this.getSequence(orgId, sequenceId);
    return this.prisma.sequenceStep.update({
      where: { id: stepId, sequenceId },
      data,
    });
  }

  async deleteStep(orgId: string, sequenceId: string, stepId: string) {
    await this.getSequence(orgId, sequenceId);
    return this.prisma.sequenceStep.delete({
      where: { id: stepId, sequenceId },
    });
  }

  async enrollContact(orgId: string, sequenceId: string, contactId: string, accountId: string) {
    const sequence = await this.getSequence(orgId, sequenceId);
    if (sequence.status !== SequenceStatus.ACTIVE) {
      throw new Error('Sequence is not active');
    }

    const firstStep = sequence.steps[0];
    if (!firstStep) throw new Error('Sequence has no steps');

    const nextExecuteAt = this.calculateNextExecution(new Date(), firstStep.delayAmount, firstStep.delayUnit);

    return this.prisma.sequenceEnrollment.create({
      data: {
        organizationId: orgId,
        sequenceId,
        contactId,
        accountId,
        currentStepIndex: 0,
        nextExecuteAt,
        status: SequenceEnrollmentStatus.ACTIVE,
      },
    });
  }

  async cancelEnrollment(orgId: string, enrollmentId: string) {
    return this.prisma.sequenceEnrollment.update({
      where: { id: enrollmentId, organizationId: orgId },
      data: { status: SequenceEnrollmentStatus.CANCELLED },
    });
  }

  private calculateNextExecution(from: Date, delayAmount: number, delayUnit: string): Date {
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
}
