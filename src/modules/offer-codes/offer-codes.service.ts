import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OfferCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.offerCode.create({
      data: {
        code: data.code.toUpperCase(),
        type: data.type,
        value: data.value,
        maxUses: data.maxUses || null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        applicablePlans: data.applicablePlans || [],
        isActive: data.isActive ?? true,
      }
    });
  }

  async findAll() {
    return this.prisma.offerCode.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async validate(code: string, planId?: string) {
    const offer = await this.prisma.offerCode.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!offer) throw new NotFoundException('Invalid offer code');
    if (!offer.isActive) throw new BadRequestException('Offer code is inactive');
    if (offer.maxUses && offer.usedCount >= offer.maxUses) throw new BadRequestException('Offer code usage limit reached');
    
    const now = new Date();
    if (offer.validFrom && now < offer.validFrom) throw new BadRequestException('Offer code is not yet valid');
    if (offer.validUntil && now > offer.validUntil) throw new BadRequestException('Offer code has expired');
    
    if (planId && offer.applicablePlans.length > 0 && !offer.applicablePlans.includes(planId)) {
      throw new BadRequestException('Offer code is not applicable for this plan');
    }

    return offer;
  }

  async incrementUsage(code: string) {
    return this.prisma.offerCode.update({
      where: { code: code.toUpperCase() },
      data: { usedCount: { increment: 1 } }
    });
  }

  async update(id: string, data: any) {
    return this.prisma.offerCode.update({
      where: { id },
      data: {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      }
    });
  }

  async remove(id: string) {
    return this.prisma.offerCode.delete({ where: { id } });
  }
}
