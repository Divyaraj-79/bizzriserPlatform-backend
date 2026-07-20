import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';
import { ChatbotStatus } from '@prisma/client';
import axios from 'axios';
import * as ExcelJS from 'exceljs';
import { TestRequestDto } from './dto/test-request.dto';

@Injectable()
export class ChatbotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    const [chatbots, total, active, inactive] = await Promise.all([
      this.prisma.chatbot.findMany({
        where: { organizationId: orgId, systemEvent: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.chatbot.count({ where: { organizationId: orgId, systemEvent: null } }),
      this.prisma.chatbot.count({ where: { organizationId: orgId, status: ChatbotStatus.ACTIVE, systemEvent: null } }),
      this.prisma.chatbot.count({
        where: {
          organizationId: orgId,
          status: { in: [ChatbotStatus.INACTIVE, ChatbotStatus.DRAFT] },
          systemEvent: null,
        },
      }),
    ]);

    return {
      chatbots,
      stats: { total, active, inactive },
    };
  }

  async findSystemChatbots(orgId: string) {
    const requiredSystemEvents = [
      {
        event: 'ORDER_CONFIRMATION',
        name: 'Order Placed (Pending)',
        description: 'Sent automatically when a customer places an order via the WhatsApp catalog.',
      },
      {
        event: 'ORDER_CONFIRMED',
        name: 'Order Confirmed (Paid)',
        description: 'Sent automatically when an order payment is completed and status is Confirmed.',
      },
      {
        event: 'ORDER_APPROVED',
        name: 'Order Approved',
        description: 'Sent automatically when an order is approved.',
      },
      {
        event: 'ORDER_REJECTED',
        name: 'Order Rejected',
        description: 'Sent automatically when an order is rejected.',
      },
      {
        event: 'ORDER_SHIPPED',
        name: 'Order Shipped',
        description: 'Sent automatically when an order is shipped.',
      },
      {
        event: 'ORDER_DELIVERED',
        name: 'Order Delivered',
        description: 'Sent automatically when an order is delivered.',
      },
      {
        event: 'ORDER_COMPLETED',
        name: 'Order Completed',
        description: 'Sent automatically when an order is marked as completed.',
      },
      {
        event: 'ORDER_REFUNDED',
        name: 'Order Refunded',
        description: 'Sent automatically when an order is refunded.',
      },
      {
        event: 'ABANDONED_CART',
        name: 'Abandoned Cart Reminder',
        description: 'Sent automatically to remind customers of their pending order.',
      },
    ];

    for (const sysEvent of requiredSystemEvents) {
      const existing = await this.prisma.chatbot.findFirst({
        where: { organizationId: orgId, systemEvent: sysEvent.event },
      });

      if (!existing) {
        // Initialize default system bot
        const defaultFlow = {
          nodes: [
            {
              id: 'trigger-1',
              type: 'triggerNode',
              position: { x: 100, y: 100 },
              data: { 
                isTrigger: true, 
                label: 'System Event',
                config: {
                  type: 'SYSTEM_EVENT',
                  eventName: sysEvent.event
                }
              },
            },
            {
              id: 'message-1',
              type: 'sendData',
              position: { x: 400, y: 100 },
              data: {
                messageType: 'text',
                text: '*Order Received!* 🎉\\n\\nYour order #{{orderId}} for {{currency}} {{totalAmount}} has been submitted successfully.\\n\\nPlease complete your payment using this link:\\n{{checkoutLink}}\\n\\nThank you for shopping with us!',
              },
            },
          ],
          edges: [
            { id: 'e1', source: 'trigger-1', target: 'message-1' },
          ],
        };

        await this.prisma.chatbot.create({
          data: {
            organizationId: orgId,
            name: sysEvent.name,
            description: sysEvent.description,
            channel: 'WHATSAPP',
            triggerType: 'SYSTEM_EVENT',
            systemEvent: sysEvent.event,
            status: 'DRAFT',
            flowData: defaultFlow,
          },
        });
      }
    }

    const chatbots = await this.prisma.chatbot.findMany({
      where: { organizationId: orgId, systemEvent: { not: null } },
      orderBy: { createdAt: 'asc' },
    });

    return { chatbots };
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

  async exportChatbotData(orgId: string, id: string): Promise<Buffer> {
    await this.findOne(orgId, id);

    const sessions = await this.prisma.chatbotSession.findMany({
      where: { chatbotId: id, organizationId: orgId },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BizzRiser';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Chatbot Data');

    // Extract all unique variable keys across all sessions
    const variableKeys = new Set<string>();
    for (const session of sessions) {
      const vars = session.variables as Record<string, any>;
      if (vars) {
        Object.keys(vars).forEach(key => variableKeys.add(key));
      }
    }
    const dynamicColumns = Array.from(variableKeys).sort();

    // Define standard columns
    const columns = [
      { header: 'Session ID', key: 'id', width: 36 },
      { header: 'Contact Name', key: 'contactName', width: 25 },
      { header: 'Contact Phone', key: 'contactPhone', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Created At', key: 'createdAt', width: 25 },
    ];

    // Append dynamic columns
    dynamicColumns.forEach(col => {
      columns.push({ header: col, key: col, width: 25 });
    });

    worksheet.columns = columns;

    // Make header row bold
    worksheet.getRow(1).font = { bold: true };

    // Add rows
    sessions.forEach(session => {
      const contactFullName = session.contact ? `${session.contact.firstName || ''} ${session.contact.lastName || ''}`.trim() : '';

      const rowData: any = {
        id: session.id,
        contactName: contactFullName || 'Unknown',
        contactPhone: session.contact?.phone || 'Unknown',
        status: session.status,
        createdAt: session.createdAt.toLocaleString(),
      };

      const vars = session.variables as Record<string, any>;
      if (vars) {
        dynamicColumns.forEach(key => {
          // Flatten objects/arrays into strings for Excel if needed
          const val = vars[key];
          rowData[key] = typeof val === 'object' ? JSON.stringify(val) : val;
        });
      }

      worksheet.addRow(rowData);
    });

    // Return buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
