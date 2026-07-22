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

  async findMyActivity(userId: string, options: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      action: { in: ['user_login', 'user_logout', 'user_login_2fa'] }
    };

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
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

  async findMySessions(userId: string) {
    // Basic session extraction from recent login activity
    const recentLogins = await this.prisma.activityLog.findMany({
      where: {
        userId,
        action: { in: ['user_login', 'user_login_2fa'] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // last 30 days
      },
      orderBy: { createdAt: 'desc' },
    });

    const sessionsMap = new Map();
    recentLogins.forEach(log => {
      const key = `${log.ip}-${log.userAgent}`;
      if (!sessionsMap.has(key)) {
        sessionsMap.set(key, {
          ip: log.ip,
          userAgent: log.userAgent,
          lastActive: log.createdAt,
          isCurrent: false, // We'll flag current in the controller
        });
      }
    });

    return Array.from(sessionsMap.values());
  }
}
