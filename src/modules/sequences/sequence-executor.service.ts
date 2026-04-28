import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SequenceEnrollmentStatus } from '@prisma/client';

@Processor('sequences')
export class SequenceExecutorService {
  private readonly logger = new Logger(SequenceExecutorService.name);

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
  ) {}

  @Process('execute-step')
  async handleExecuteStep(job: Job<any>) {
    const { enrollmentId } = job.data;
    
    const enrollment = await this.prisma.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        sequence: { include: { steps: { orderBy: { orderIndex: 'asc' } } } },
        contact: true,
      },
    });

    if (!enrollment || enrollment.status !== SequenceEnrollmentStatus.ACTIVE) {
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
      
      // Execute the action (simplified integration using WhatsAppService)
      if (currentStep.actionType === 'SEND_TEXT') {
        const text = (currentStep.actionData as any).text;
        if (text) {
          // Replace simple variables here if needed
          const message = text.replace('{{contact.firstName}}', contact.firstName || '');
          await this.whatsappService.sendTextMessage(
            enrollment.organizationId,
            enrollment.accountId,
            contact.phone,
            message
          );
        }
      } else if (currentStep.actionType === 'SEND_TEMPLATE') {
        const templateName = (currentStep.actionData as any).templateName;
        const language = (currentStep.actionData as any).language || 'en_US';
        const components = (currentStep.actionData as any).components || [];
        await this.whatsappService.sendTemplateMessage(
          enrollment.organizationId,
          enrollment.accountId,
          contact.phone,
          templateName,
          language,
          components
        );
      }
      
      // Move to next step
      const nextIndex = enrollment.currentStepIndex + 1;
      const nextStep = sequence.steps[nextIndex];

      if (nextStep) {
        // We will schedule the next execution delay using CRON or a scheduled checker,
        // but for standard queue we use BullMQ delay on enqueue.
        // Here we just update the DB, the scheduler will pick it up.
        await this.prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStepIndex: nextIndex,
            nextExecuteAt: this.calculateDelay(new Date(), nextStep.delayAmount, nextStep.delayUnit),
          },
        });
      } else {
        await this.markCompleted(enrollment.id);
      }
    } catch (error) {
      this.logger.error(`Failed to execute sequence step: ${error.message}`);
      // Pause on failure for manual intervention, or continue.
      // For now, pause.
      await this.prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: SequenceEnrollmentStatus.PAUSED },
      });
    }
  }

  private async markCompleted(enrollmentId: string) {
    await this.prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: SequenceEnrollmentStatus.COMPLETED,
        completedAt: new Date(),
        nextExecuteAt: null,
      },
    });
  }

  private calculateDelay(from: Date, delayAmount: number, delayUnit: string): Date {
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
}
