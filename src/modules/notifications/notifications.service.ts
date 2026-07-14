import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from '../auth/mail.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
    private mailService: MailService,
  ) {}

  async create(data: any, createdByUserId?: string) {
    const notification = await this.prisma.systemNotification.create({
      data: {
        title: data.title,
        message: data.message,
        ctaLabel: data.ctaLabel || null,
        ctaUrl: data.ctaUrl || null,
        imageUrl: data.imageUrl || null,
        type: data.type || 'TOAST',
        category: data.category || 'INFO',
        priority: data.priority || 'NORMAL',
        audience: data.audience || 'ALL',
        targetOrgIds: data.targetOrgIds || [],
        targetPlanId: data.targetPlanId || null,
        channels: data.channels || ['IN_APP'],
        isScheduled: data.isScheduled || false,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isPinned: data.isPinned || false,
        createdBy: createdByUserId,
        status: (data.isScheduled && data.scheduledFor) ? 'SCHEDULED' : 'DRAFT',
      },
    });

    if (!notification.isScheduled) {
      await this.broadcast(notification);
    }

    return notification;
  }

  async resolveAudienceUserIds(notification: any): Promise<string[]> {
    switch (notification.audience) {
      case 'ALL':
        const allUsers = await this.prisma.user.findMany({ select: { id: true } });
        return allUsers.map(u => u.id);
      case 'ORG_ADMINS':
        const orgAdmins = await this.prisma.user.findMany({ 
          where: { role: 'ORG_ADMIN' }, select: { id: true } 
        });
        return orgAdmins.map(u => u.id);
      case 'SPECIFIC_ORGS':
        if (!notification.targetOrgIds || notification.targetOrgIds.length === 0) return [];
        const specificOrgUsers = await this.prisma.user.findMany({
          where: { organizationId: { in: notification.targetOrgIds } },
          select: { id: true }
        });
        return specificOrgUsers.map(u => u.id);
      case 'SPECIFIC_PLAN':
        if (!notification.targetPlanId) return [];
        const specificPlanUsers = await this.prisma.user.findMany({
          where: { organization: { packageId: notification.targetPlanId } },
          select: { id: true }
        });
        return specificPlanUsers.map(u => u.id);
      case 'SUPER_ADMIN':
        const superAdmins = await this.prisma.user.findMany({ 
          where: { role: 'SUPER_ADMIN' }, select: { id: true } 
        });
        return superAdmins.map(u => u.id);
      default:
        return [];
    }
  }

  async broadcast(notification: any) {
    this.logger.log(`Broadcasting notification: ${notification.title}`);

    const userIds = await this.resolveAudienceUserIds(notification);

    // Update status to SENT and save recipientCount
    await this.prisma.systemNotification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: userIds.length },
    });

    const channels = notification.channels || [];
    
    // In-App Delivery
    if (channels.includes('IN_APP')) {
      // If ALL users are targeted, we could just broadcast to everyone.
      // But to respect newly connected users, they will get it from findAllForUser.
      // For connected sockets, we emit to specific user rooms if not ALL.
      if (notification.audience === 'ALL') {
        this.realtimeGateway.server.emit('notification:new', notification);
      } else {
        const rooms = userIds.map(id => `user_${id}`);
        if (rooms.length > 0) {
          this.realtimeGateway.server.to(rooms).emit('notification:new', notification);
        }
      }

      await this.prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'IN_APP',
          status: 'sent',
          recipientCount: userIds.length,
          sentAt: new Date(),
        }
      });
    }

    // Email delivery (placeholder for Phase 3)
    if (channels.includes('EMAIL')) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, status: 'ACTIVE' },
        select: { email: true }
      });

      const validEmails = users.filter(user => user.email).map(user => user.email!);

      if (validEmails.length > 0) {
        // Send async without awaiting so we don't block the broadcast
        this.mailService.sendSystemNotification(
          validEmails,
          notification.title,
          notification.message,
          notification.ctaLabel,
          notification.ctaUrl
        ).catch(e => this.logger.error(`Error sending batch emails`, e));
      }

      await this.prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'EMAIL',
          status: 'sent',
          recipientCount: validEmails.length,
          sentAt: new Date(),
        }
      });
    }
  }

  async findAllAdmin() {
    const data = await this.prisma.systemNotification.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        deliveries: true,
      }
    });
    return data;
  }

  async remove(id: string) {
    await this.prisma.systemNotification.delete({ where: { id } });
    return { message: 'Notification deleted successfully' };
  }

  // Find all active notifications for a user that they haven't read
  async findAllForUser(userId: string, userCreatedAt: Date) {
    // Determine the user's role and organization to filter audience
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, organizationId: true, createdAt: true, organization: { select: { packageId: true, createdAt: true } } }
    });

    if (!user) return { unread: [], read: [] };

    // Use organization creation date if available, otherwise user creation date
    const actualUserCreatedAt = user.organization?.createdAt || user.createdAt;

    // Build audience conditions
    const audienceConditions: any[] = [
      { audience: 'ALL' }
    ];

    if (user.organizationId) {
      audienceConditions.push({ audience: 'SPECIFIC_ORGS', targetOrgIds: { has: user.organizationId } });
    }

    if (user.role === 'SUPER_ADMIN') {
      audienceConditions.push({ audience: 'SUPER_ADMIN' });
    }
    if (user.role === 'ORG_ADMIN') {
      audienceConditions.push({ audience: 'ORG_ADMINS' });
    }
    if (user.organization?.packageId) {
      audienceConditions.push({ audience: 'SPECIFIC_PLAN', targetPlanId: user.organization.packageId });
    }

    const unread = await this.prisma.systemNotification.findMany({
      where: {
        isActive: true,
        isScheduled: false,
        createdAt: { gte: actualUserCreatedAt },
        OR: audienceConditions,
        reads: {
          none: { userId },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const read = await this.prisma.systemNotification.findMany({
      where: {
        isActive: true,
        createdAt: { gte: actualUserCreatedAt },
        OR: audienceConditions,
        reads: {
          some: { 
            userId,
            isDismissed: false
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Only fetch last 20 read notifications for dropdown history
    });

    return { unread, read };
  }

  async markAsRead(notificationId: string, userId: string) {
    try {
      await this.prisma.notificationRead.upsert({
        where: {
          userId_notificationId: {
            userId,
            notificationId,
          }
        },
        update: {
          viewedAt: new Date(),
        },
        create: {
          userId,
          notificationId,
          viewedAt: new Date(),
        }
      });
    } catch (e) {
      // Ignore
    }
    return true;
  }

  async dismiss(notificationId: string, userId: string) {
    try {
      await this.prisma.notificationRead.upsert({
        where: {
          userId_notificationId: {
            userId,
            notificationId,
          }
        },
        update: {
          isDismissed: true,
        },
        create: {
          userId,
          notificationId,
          isDismissed: true,
        }
      });
    } catch (e) {
      // Ignore
    }
    return true;
  }

  // ─── Cron Job for Scheduled Notifications ────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledNotifications() {
    const now = new Date();
    
    // Find scheduled notifications that are due
    const pendingNotifications = await this.prisma.systemNotification.findMany({
      where: {
        isActive: true,
        isScheduled: true,
        scheduledFor: {
          lte: now,
        },
        status: 'SCHEDULED'
      },
    });

    if (pendingNotifications.length > 0) {
      this.logger.log(`Found ${pendingNotifications.length} scheduled notifications to broadcast.`);

      for (const notification of pendingNotifications) {
        await this.broadcast(notification);

        // Mark as no longer scheduled so it doesn't get picked up again
        await this.prisma.systemNotification.update({
          where: { id: notification.id },
          data: { isScheduled: false },
        });
      }
    }
  }

  // ─── Automated Event Triggers ────────────────────────────────────────────

  @Cron('0 0 * * *') // Run every day at midnight
  async checkLowCredits() {
    this.logger.log('Running automated low credits check...');
    const threshold = 100; // Define low credits threshold

    const lowCreditOrgs = await this.prisma.organization.findMany({
      where: {
        credits: { lte: threshold },
        status: 'ACTIVE'
      }
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const org of lowCreditOrgs) {
      // Check if we already warned them in the last 24 hours to avoid spam
      const recentWarning = await this.prisma.systemNotification.findFirst({
        where: {
          category: 'CREDITS',
          audience: 'SPECIFIC_ORGS',
          targetOrgIds: { has: org.id },
          createdAt: { gte: oneDayAgo }
        }
      });

      if (!recentWarning) {
        // Create and broadcast the warning
        const notification = await this.prisma.systemNotification.create({
          data: {
            title: 'Low Credits Warning',
            message: `Your organization "${org.name}" has ${org.credits} credits remaining. Please recharge soon to avoid service disruption.`,
            type: 'POPUP',
            category: 'CREDITS',
            priority: 'HIGH',
            audience: 'SPECIFIC_ORGS',
            targetOrgIds: [org.id],
            ctaLabel: 'Recharge Now',
            ctaUrl: '/dashboard/billing',
            isActive: true,
            isScheduled: false,
            channels: ['IN_APP']
          }
        });
        await this.broadcast(notification);
      }
    }
  }

  @Cron('0 1 * * *') // Run every day at 1 AM
  async checkExpiringSubscriptions() {
    this.logger.log('Running automated expiring subscriptions check...');
    const now = new Date();
    
    // We check for orgs expiring in exactly 3 days, 1 day, and 0 days
    // To do this simply, we'll find all orgs expiring within 4 days and calculate
    const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const expiringOrgs = await this.prisma.organization.findMany({
      where: {
        expiryDate: {
          lte: fourDaysFromNow,
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) // up to 1 day expired
        },
        status: 'ACTIVE'
      }
    });

    for (const org of expiringOrgs) {
      if (!org.expiryDate) continue;

      const msLeft = org.expiryDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      // Determine milestone: 3, 1, or 0
      let milestone: number | null = null;
      if (daysLeft === 3) milestone = 3;
      else if (daysLeft === 1) milestone = 1;
      else if (daysLeft <= 0) milestone = 0;

      if (milestone !== null) {
        // Check if we already warned for this specific milestone (using message matching or just checking last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentWarning = await this.prisma.systemNotification.findFirst({
          where: {
            category: 'SUBSCRIPTION',
            audience: 'SPECIFIC_ORGS',
            targetOrgIds: { has: org.id },
            createdAt: { gte: oneDayAgo }
          }
        });

        if (!recentWarning) {
          const isCritical = milestone <= 1;
          const notification = await this.prisma.systemNotification.create({
            data: {
              title: isCritical ? 'Subscription Expiring Soon!' : 'Subscription Reminder',
              message: milestone === 0 
                ? `Your subscription for "${org.name}" has expired. Please renew immediately to maintain access.`
                : `Your subscription for "${org.name}" will expire in ${milestone} day(s).`,
              type: 'POPUP',
              category: 'SUBSCRIPTION',
              priority: isCritical ? 'CRITICAL' : 'HIGH',
              audience: 'SPECIFIC_ORGS',
              targetOrgIds: [org.id],
              ctaLabel: 'Renew Now',
              ctaUrl: '/dashboard/billing',
              isActive: true,
              isScheduled: false,
              channels: ['IN_APP']
            }
          });
          await this.broadcast(notification);
        }
      }
    }
  }

  async getInboxForUser(userId: string, filters: { status?: 'unread' | 'read' | 'all'; category?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, organizationId: true, organization: { select: { packageId: true } } } });
    if (!user) return { data: [], total: 0 };

    // Build the query to find all relevant notifications for this user
    // They must have been SENT, active, not expired
    const now = new Date();
    
    const audienceConditions: any[] = [
      { audience: 'ALL' },
      { audience: 'SPECIFIC_ORGS', targetOrgIds: { has: user.organizationId } },
    ];
    if (user.role === 'ORG_ADMIN') audienceConditions.push({ audience: 'ORG_ADMINS' });
    if (user.role === 'SUPER_ADMIN') audienceConditions.push({ audience: 'SUPER_ADMIN' });
    if (user.organization?.packageId) audienceConditions.push({ audience: 'SPECIFIC_PLAN', targetPlanId: user.organization.packageId });

    const whereClause: any = {
      status: 'SENT',
      isActive: true,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: audienceConditions }
      ]
    };

    if (filters.category && filters.category !== 'ALL') {
      whereClause.category = filters.category;
    }

    if (filters.startDate) {
      whereClause.createdAt = { gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      if (whereClause.createdAt) {
        whereClause.createdAt.lte = end;
      } else {
        whereClause.createdAt = { lte: end };
      }
    }

    const [total, notifications] = await Promise.all([
      this.prisma.systemNotification.count({ where: whereClause }),
      this.prisma.systemNotification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reads: {
            where: { userId }
          }
        }
      })
    ]);

    // Format the response
    const formatted = notifications.map(notif => {
      const readRecord = notif.reads[0];
      const isRead = !!readRecord;
      const isDismissed = readRecord?.isDismissed || false;

      return {
        ...notif,
        isRead,
        isDismissed,
        viewedAt: readRecord?.viewedAt || null,
        reads: undefined // remove relation array
      };
    });

    // Filter by read/unread if requested
    let result = formatted;
    if (filters.status === 'unread') {
      result = formatted.filter(n => !n.isRead);
    } else if (filters.status === 'read') {
      result = formatted.filter(n => n.isRead);
    }

    return {
      data: result,
      total: filters.status && filters.status !== 'all' ? result.length : total,
      page,
      limit
    };
  }

  async getAnalyticsForAdmin(notifId: string) {
    const notification = await this.prisma.systemNotification.findUnique({
      where: { id: notifId },
      include: {
        reads: {
          include: {
            user: { select: { organization: { select: { name: true } } } }
          }
        }
      }
    });

    if (!notification) throw new Error('Notification not found');

    const totalReads = notification.reads.length;
    const dismissedOnly = notification.reads.filter(r => r.isDismissed && !r.viewedAt).length;
    const actualReads = notification.reads.filter(r => r.viewedAt).length;

    const readByOrg: Record<string, number> = {};
    notification.reads.forEach(r => {
      if (r.viewedAt) {
        const orgName = r.user?.organization?.name || 'Unknown';
        readByOrg[orgName] = (readByOrg[orgName] || 0) + 1;
      }
    });

    const orgBreakdown = Object.entries(readByOrg).map(([orgName, readCount]) => ({
      orgName,
      readCount
    })).sort((a, b) => b.readCount - a.readCount);

    return {
      recipientCount: notification.recipientCount,
      readCount: actualReads,
      dismissedCount: dismissedOnly,
      deliveryRate: notification.recipientCount > 0 ? (actualReads / notification.recipientCount) * 100 : 0,
      orgBreakdown
    };
  }
}
