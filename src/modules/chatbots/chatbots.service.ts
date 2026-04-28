import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';
import { ChatbotStatus } from '@prisma/client';
import axios from 'axios';
import { TestRequestDto } from './dto/test-request.dto';

@Injectable()
export class ChatbotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    const [chatbots, total, active, inactive] = await Promise.all([
      this.prisma.chatbot.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.chatbot.count({ where: { organizationId: orgId } }),
      this.prisma.chatbot.count({ where: { organizationId: orgId, status: ChatbotStatus.ACTIVE } }),
      this.prisma.chatbot.count({
        where: {
          organizationId: orgId,
          status: { in: [ChatbotStatus.INACTIVE, ChatbotStatus.DRAFT] },
        },
      }),
    ]);

    return {
      chatbots,
      stats: { total, active, inactive },
    };
  }

  async findOne(orgId: string, id: string) {
    const chatbot = await this.prisma.chatbot.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!chatbot) {
      throw new NotFoundException(`ChatBOT with ID "${id}" not found.`);
    }

    return chatbot;
  }

  async create(orgId: string, dto: CreateChatbotDto) {
    return this.prisma.chatbot.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        description: dto.description,
        channel: dto.channel,
        triggerType: dto.triggerType,
        keywords: dto.keywords ?? [],
        status: ChatbotStatus.DRAFT,
        flowData: {},
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdateChatbotDto) {
    await this.findOne(orgId, id);

    return this.prisma.chatbot.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.triggerType !== undefined && { triggerType: dto.triggerType }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.keywords !== undefined && { keywords: dto.keywords }),
        ...(dto.flowData !== undefined && { flowData: dto.flowData }),
        ...(dto.executions !== undefined && { executions: dto.executions }),
      },
    });
  }

  async remove(orgId: string, id: string) {
    await this.findOne(orgId, id);
    await this.prisma.chatbot.delete({ where: { id } });
    return { message: 'ChatBOT deleted successfully.' };
  }

  async activate(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return this.prisma.chatbot.update({
      where: { id },
      data: { status: ChatbotStatus.ACTIVE },
    });
  }

  async deactivate(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return this.prisma.chatbot.update({
      where: { id },
      data: { status: ChatbotStatus.INACTIVE },
    });
  }

  async clone(orgId: string, id: string) {
    const original = await this.findOne(orgId, id);

    return this.prisma.chatbot.create({
      data: {
        organizationId: orgId,
        name: `${original.name} (Copy)`,
        description: original.description,
        channel: original.channel,
        triggerType: original.triggerType,
        keywords: original.keywords,
        flowData: original.flowData as any,
        status: ChatbotStatus.DRAFT,
      },
    });
  }

  async executeTestRequest(dto: TestRequestDto) {
    const { method, url, queryParams, headers, body } = dto;

    const params: any = {};
    queryParams?.forEach(p => {
      if (p.key) params[p.key] = p.value;
    });

    const axiosHeaders: any = {};
    headers?.forEach(h => {
      if (h.key) axiosHeaders[h.key] = h.value;
    });

    try {
      const response = await axios({
        method,
        url,
        params,
        headers: axiosHeaders,
        data: body,
        timeout: 10000,
      });

      return {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      };
    } catch (error: any) {
      return {
        status: error.response?.status || 500,
        statusText: error.response?.statusText || 'Internal Server Error',
        data: error.response?.data || { message: error.message },
        headers: error.response?.headers || {},
      };
    }
  }
}
