import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsAppFlowStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';

@Injectable()
export class WhatsAppFlowsService {
  private readonly logger = new Logger(WhatsAppFlowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async createFlow(orgId: string, data: { name: string; description?: string; categories?: string[] }) {
    return this.prisma.whatsAppFlow.create({
      data: {
        organizationId: orgId,
        name: data.name,
        description: data.description,
        categories: data.categories || ['OTHER'],
        definition: {}, // Initial empty definition
      },
    });
  }

  async getFlow(orgId: string, id: string) {
    const flow = await this.prisma.whatsAppFlow.findFirst({
      where: { id, organizationId: orgId },
      include: { submissions: { take: 5, orderBy: { submittedAt: 'desc' } } }
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  async listFlows(orgId: string) {
    return this.prisma.whatsAppFlow.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateFlow(orgId: string, id: string, data: { name?: string; description?: string; definition?: any }) {
    const flow = await this.getFlow(orgId, id);
    
    if (flow.status === WhatsAppFlowStatus.PUBLISHED && data.definition) {
      throw new ConflictException('Cannot update definition of a PUBLISHED flow. Please create a new version.');
    }

    return this.prisma.whatsAppFlow.update({
      where: { id },
      data,
    });
  }

  /**
   * Syncs the flow with Meta and sets status to PUBLISHED.
   * Note: This requires a valid WhatsApp Account to be linked.
   */
  async publishFlow(orgId: string, id: string, accountId: string) {
    const flow = await this.getFlow(orgId, id);
    
    // 1. Logic to sync with Meta via WhatsappService (to be implemented)
    // const metaFlow = await this.whatsapp.createMetaFlow(orgId, accountId, flow);
    
    // 2. Update local status
    return this.prisma.whatsAppFlow.update({
      where: { id },
      data: { 
        status: WhatsAppFlowStatus.PUBLISHED,
        // flowId: metaFlow.id 
      },
    });
  }

  async deleteFlow(orgId: string, id: string) {
    const flow = await this.getFlow(orgId, id);
    if (flow.status === WhatsAppFlowStatus.PUBLISHED) {
       // Ideally we should deprecate on Meta first
    }
    return this.prisma.whatsAppFlow.delete({ where: { id } });
  }

  async getSubmissions(orgId: string, flowId: string) {
    return this.prisma.whatsAppFlowSubmission.findMany({
      where: { flowId, organizationId: orgId },
      include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async handleFlowSubmission(orgId: string, flowId: string, contactId: string, data: any) {
    // 1. Save submission
    const submission = await this.prisma.whatsAppFlowSubmission.create({
      data: {
        organizationId: orgId,
        flowId,
        contactId,
        data,
      }
    });

    // 2. Map data to CRM Custom Fields (Smart Sync)
    const customFields = await this.prisma.customField.findMany({ where: { organizationId: orgId } });
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    
    if (contact) {
      const existingData = contact.customFields as any || {};
      const newData = { ...existingData };
      
      // Look for matches between form keys and custom field names
      Object.keys(data).forEach(key => {
        const field = customFields.find(f => f.name.toLowerCase() === key.toLowerCase());
        if (field) {
          newData[field.name] = data[key];
        }
      });

      await this.prisma.contact.update({
        where: { id: contactId },
        data: { customFields: newData }
      });
    }

    return submission;
  }

  async exportSubmissionsToExcel(orgId: string, flowId: string) {
    const flow = await this.getFlow(orgId, flowId);
    const submissions = await this.getSubmissions(orgId, flowId);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Submissions');

    // 1. Identify all unique keys across all submissions to build columns
    const allKeys = new Set<string>();
    submissions.forEach((s: any) => {
      const data = s.data as any;
      Object.keys(data).forEach(k => allKeys.add(k));
    });

    const columns = [
      { header: 'Submitted At', key: 'submittedAt', width: 25 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Contact Name', key: 'name', width: 25 },
      ...Array.from(allKeys).map(k => ({ header: k, key: k, width: 20 }))
    ];

    worksheet.columns = columns;

    // 2. Add rows
    submissions.forEach((s: any) => {
      const data = s.data as any;
      const row = {
        submittedAt: s.submittedAt.toISOString(),
        phone: s.contact.phone,
        name: `${s.contact.firstName || ''} ${s.contact.lastName || ''}`.trim(),
        ...data
      };
      worksheet.addRow(row);
    });

    // Styling
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEEEEEE' }
    };

    return workbook.xlsx.writeBuffer();
  }
}
