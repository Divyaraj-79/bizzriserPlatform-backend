import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlowExecutorService } from './flow-executor.service';
import { ChatbotSessionStatus } from '@prisma/client';

@Processor('flow-delays')
export class FlowDelayProcessor {
  private readonly logger = new Logger(FlowDelayProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowExecutor: FlowExecutorService,
  ) {}

  @Process('resume-after-delay')
  async handleResumeAfterDelay(job: Job<any>) {
    const { sessionId, nextNodeId, organizationId, accountId, contactId } = job.data;
    this.logger.log(`Resuming session ${sessionId} after delay, advancing to node ${nextNodeId}`);

    try {
      const session = await this.prisma.chatbotSession.findUnique({ where: { id: sessionId } });
      if (!session || session.status === ChatbotSessionStatus.COMPLETED) {
        this.logger.log(`Session ${sessionId} is already completed. Skipping delay resume.`);
        return;
      }

      const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) return;

      const chatbot = await this.prisma.chatbot.findUnique({ where: { id: session.chatbotId } });
      if (!chatbot) return;

      const flowData = chatbot.flowData as any;
      const allNodes = flowData?.nodes || [];
      const allEdges = flowData?.edges || [];
      const nextNode = allNodes.find((n: any) => n.id === nextNodeId);

      if (!nextNode) {
        await this.prisma.chatbotSession.update({
          where: { id: sessionId },
          data: { status: ChatbotSessionStatus.COMPLETED },
        });
        return;
      }

      const activeSession = await this.prisma.chatbotSession.update({
        where: { id: sessionId },
        data: { status: ChatbotSessionStatus.ACTIVE, waitingForInput: false, currentNodeId: nextNodeId },
      });

      await this.flowExecutor['executeNode'](activeSession as any, nextNode, allEdges, allNodes, contact, {});
    } catch (err: any) {
      this.logger.error(`Error resuming delayed session ${sessionId}: ${err.message}`);
      throw err;
    }
  }
}
