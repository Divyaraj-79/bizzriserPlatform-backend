import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.package.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async findOne(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  async create(data: any) {
    return this.prisma.package.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return this.prisma.package.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.package.delete({
      where: { id },
    });
  }
}
