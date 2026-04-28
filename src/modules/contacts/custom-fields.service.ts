import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomFieldsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.customField.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, data: { name: string; type?: string; isRequired?: boolean }) {
    console.log('[CustomFieldsService] create params:', { organizationId, data });
    if (!organizationId) {
      console.error('[CustomFieldsService] Missing organizationId');
      throw new Error('Organization ID is missing in request.');
    }

    // Check if exists
    const existing = await this.prisma.customField.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new Error(`A custom field with the name "${data.name}" already exists.`);
    }

    return this.prisma.customField.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type || 'TEXT',
        isRequired: data.isRequired || false,
      },
    });
  }

  async delete(organizationId: string, id: string) {
    const field = await this.prisma.customField.findFirst({
      where: { id, organizationId }
    });

    if (!field) {
      throw new NotFoundException('Custom field not found');
    }

    return this.prisma.customField.delete({
      where: { id },
    });
  }
}
