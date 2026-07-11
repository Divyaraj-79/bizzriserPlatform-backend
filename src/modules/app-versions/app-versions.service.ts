import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppVersionsService {
  private readonly logger = new Logger(AppVersionsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService
  ) {}

  async create(data: { version: string; title: string; highlights: string[]; changelog?: string; notifyUsers?: boolean; isPublished?: boolean; isScheduled?: boolean; scheduledFor?: string; emailUsers?: boolean }) {
    const existing = await this.prisma.appVersion.findUnique({ where: { version: data.version } });
    if (existing) {
      throw new ConflictException(`Version ${data.version} already exists.`);
    }

    const appVersion = await this.prisma.appVersion.create({
      data: {
        version: data.version,
        title: data.title,
        highlights: data.highlights,
        changelog: data.changelog,
        isPublished: data.isPublished ?? true,
        notifyUsers: data.notifyUsers ?? true,
        isScheduled: data.isScheduled ?? false,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        publishedAt: (!data.isScheduled && (data.isPublished ?? true)) ? new Date() : null,
      },
    });

    // Automatically send a system notification if configured and published
    if (appVersion.isPublished && appVersion.notifyUsers) {
      this.triggerVersionNotification(appVersion, data.emailUsers ?? false);
    }

    return appVersion;
  }

  async findAll() {
    return this.prisma.appVersion.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async findLatestPublished(userId: string) {
    const now = new Date();
    const latest = await this.prisma.appVersion.findFirst({
      where: {
        isPublished: true,
        OR: [
          { isScheduled: false },
          { isScheduled: true, scheduledFor: { lte: now } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latest) return null;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { lastSeenVersion: true } });
    const hasSeen = user?.lastSeenVersion === latest.version;

    return { ...latest, hasSeen };
  }

  async acknowledge(userId: string, versionId: string) {
    const appVersion = await this.prisma.appVersion.findUnique({ where: { id: versionId } });
    if (!appVersion) {
      throw new NotFoundException('Version not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenVersion: appVersion.version }
    });

    return { success: true, version: appVersion.version };
  }

  private async triggerVersionNotification(appVersion: any, includeEmail: boolean = false) {
    const message = `Platform updated to ${appVersion.version}. Checkout the new features!`;
    
    const channels = ['IN_APP'];
    if (includeEmail) {
      channels.push('EMAIL');
    }

    const notification = await this.prisma.systemNotification.create({
      data: {
        title: `New Version: ${appVersion.title}`,
        message: message,
        type: 'POPUP',
        category: 'NEW_FEATURE',
        priority: 'NORMAL',
        audience: 'ALL',
        isActive: true,
        isScheduled: appVersion.isScheduled,
        scheduledFor: appVersion.scheduledFor,
        status: appVersion.isScheduled ? 'SCHEDULED' : 'SENT',
        channels
      }
    });

    if (!appVersion.isScheduled) {
      // Broadcast in background
      this.notificationsService.broadcast(notification).catch(err => {
        this.logger.error(`Failed to broadcast version notification: ${err.message}`, err.stack);
      });
    }
  }
}
