import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdate(orgId: string, phone: string, data: any) {
    return this.prisma.contact.upsert({
      where: { organizationId_phone: { organizationId: orgId, phone } },
      update: data,
      create: { ...data, organizationId: orgId, phone },
    });
  }
}
