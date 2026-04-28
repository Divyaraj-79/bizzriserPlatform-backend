import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActivityLoggerService {
  constructor(private prisma: PrismaService) {}

  async log(userId: string, action: string, details: any = {}, ip?: string, userAgent?: string) {
    try {
      return await this.prisma.activityLog.create({
        data: {
          userId,
          action,
          details,
          ip,
          userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to create activity log:', error);
    }
  }

  async findAllByOrganization(organizationId: string, options: { page?: number; limit?: number; userId?: string } = {}) {
    const { page = 1, limit = 10, userId } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      user: {
        organizationId,
      },
    };

    if (userId) {
      where.userId = userId;
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
    };
  }
}
