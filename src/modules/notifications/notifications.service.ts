import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeGateway: RealtimeGateway,
  ) {}

  async create(data: { title: string; message: string; type: 'POPUP' | 'TOAST'; isScheduled?: boolean; scheduledFor?: string }) {
    const notification = await this.prisma.systemNotification.create({
      data: {
        title: data.title,
        message: data.message,
        type: data.type,
        isScheduled: data.isScheduled || false,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
      },
    });

    if (!notification.isScheduled) {
      // Broadcast immediately
      this.realtimeGateway.server.emit('notification:new', notification);
    }

    return { success: true, data: notification };
  }

  async findAllAdmin() {
    const data = await this.prisma.systemNotification.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data };
  }

  async remove(id: string) {
    await this.prisma.systemNotification.delete({ where: { id } });
    return { success: true, message: 'Notification deleted successfully' };
  }

  // Find all active notifications for a user that they haven't read
  async findAllForUser(userId: string, userCreatedAt: Date) {
    const unread = await this.prisma.systemNotification.findMany({
      where: {
        isActive: true,
        isScheduled: false,
        createdAt: { gte: userCreatedAt },
        reads: {
          none: { userId },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const read = await this.prisma.systemNotification.findMany({
      where: {
        isActive: true,
        reads: {
          some: { userId },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Only fetch last 20 read notifications for dropdown history
    });

    return { success: true, data: { unread, read } };
  }

  async markAsRead(notificationId: string, userId: string) {
    try {
      await this.prisma.notificationRead.create({
        data: {
          userId,
          notificationId,
        },
      });
    } catch (e) {
      // Ignore if already marked as read
    }
    return { success: true };
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
      },
    });

    if (pendingNotifications.length > 0) {
      this.logger.log(`Found ${pendingNotifications.length} scheduled notifications to broadcast.`);

      for (const notification of pendingNotifications) {
        // Broadcast via Socket
        this.realtimeGateway.server.emit('notification:new', notification);

        // Mark as no longer scheduled so it doesn't get picked up again
        await this.prisma.systemNotification.update({
          where: { id: notification.id },
          data: { isScheduled: false },
        });
      }
    }
  }
}
