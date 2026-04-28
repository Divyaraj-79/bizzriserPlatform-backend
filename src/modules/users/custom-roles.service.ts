import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.customRole.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, data: { name: string; permissions: any }) {
    const existing = await this.prisma.customRole.findFirst({
      where: { organizationId, name: data.name },
    });
    if (existing) throw new ConflictException('A role with this name already exists');

    return this.prisma.customRole.create({
      data: {
        organizationId,
        name: data.name,
        permissions: data.permissions,
      },
    });
  }

  async remove(id: string, organizationId: string) {
    const role = await this.prisma.customRole.findFirst({
      where: { id, organizationId },
    });
    if (!role) throw new NotFoundException('Custom role not found');

    return this.prisma.customRole.delete({ where: { id } });
  }
}
