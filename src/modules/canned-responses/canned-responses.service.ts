import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.cannedResponse.findMany({
      where: { organizationId: orgId },
      orderBy: { shortcut: 'asc' },
    });
  }

  async create(orgId: string, data: { shortcut: string; body: string }) {
    return this.prisma.cannedResponse.create({
      data: {
        ...data,
        organizationId: orgId,
      },
    });
  }

  async update(orgId: string, id: string, data: { shortcut?: string; body?: string }) {
    const response = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!response || response.organizationId !== orgId) {
      throw new NotFoundException('Canned response not found');
    }

    return this.prisma.cannedResponse.update({
      where: { id },
      data,
    });
  }

  async remove(orgId: string, id: string) {
    const response = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!response || response.organizationId !== orgId) {
      throw new NotFoundException('Canned response not found');
    }

    return this.prisma.cannedResponse.delete({ where: { id } });
  }
}
