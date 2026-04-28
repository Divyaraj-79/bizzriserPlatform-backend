import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string) {
    try {
      // 1. Sanitize IDs to avoid Prisma crashes
      const isInvalid = (val: any) => 
        typeof val === 'string' && 
        (val === 'null' || val === 'undefined' || val === 'all' || !val.trim());

      if (isInvalid(accountContext)) {
        accountContext = undefined;
      }
      
      const messageWhere: any = { organizationId: orgId };
      const campaignWhere: any = { organizationId: orgId };
      
      // Filter by account(s) if specifically provided
      if (accountContext) {
        if (Array.isArray(accountContext)) {
          messageWhere.whatsappAccountId = { in: accountContext };
        } else {
          messageWhere.whatsappAccountId = accountContext;
          // Note: Campaign filtering by account is currently skipped to avoid JSON query performance issues and 400 errors.
          // It will fallback to organization-wide campaign stats for now.
        }
      }

      if (startDate || endDate) {
        const dateFilter = {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        };
        messageWhere.createdAt = dateFilter;
        campaignWhere.createdAt = dateFilter;
      }

      // Messages Analytics
      const messageStats = await this.prisma.message.groupBy({
        by: ['status'],
        where: {
          ...messageWhere,
          direction: 'OUTBOUND',
        },
        _count: {
          id: true,
        },
      });

      const inboundCount = await this.prisma.message.count({
        where: {
          ...messageWhere,
          direction: 'INBOUND',
        },
      });

      let totalOutbound = 0;
      let delivered = 0;
      let read = 0;
      let failed = 0;

      messageStats.forEach((stat) => {
        const count = stat._count.id || 0;
        totalOutbound += count;
        if (stat.status === 'DELIVERED' || stat.status === 'READ') delivered += count;
        if (stat.status === 'READ') read += count;
        if (stat.status === 'FAILED') failed += count;
      });

      const deliveryRate = totalOutbound > 0 ? (delivered / totalOutbound) * 100 : 0;
      const readRate = totalOutbound > 0 ? (read / totalOutbound) * 100 : 0;
      const replyRate = totalOutbound > 0 ? (inboundCount / totalOutbound) * 100 : 0;
      const failureRate = totalOutbound > 0 ? (failed / totalOutbound) * 100 : 0;

      // Campaigns Summary
      const activeCampaigns = await this.prisma.campaign.count({
        where: {
          ...campaignWhere,
          status: { in: ['RUNNING', 'SCHEDULED'] },
        },
      });

      const totalCampaigns = await this.prisma.campaign.count({
        where: campaignWhere,
      });

      const uniqueContacts = await this.prisma.contact.count({
        where: { organizationId: orgId },
      });

      // Time series for Charts
      const recentMessages = await this.prisma.message.findMany({
        where: messageWhere,
        select: { createdAt: true, direction: true, status: true }
      });

      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date();
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 0;
      const resolution = diffDays <= 2 ? 'hour' : 'day';

      const chartDataMap: Record<string, { inbound: number, outbound: number, failed: number }> = {};
      recentMessages.forEach(msg => {
        let key = msg.createdAt.toISOString().split('T')[0];
        if (resolution === 'hour') {
          key = msg.createdAt.toISOString().substring(0, 13) + ':00';
        }
        
        if (!chartDataMap[key]) chartDataMap[key] = { inbound: 0, outbound: 0, failed: 0 };
        if (msg.direction === 'INBOUND') chartDataMap[key].inbound++;
        else {
          chartDataMap[key].outbound++;
          if (msg.status === 'FAILED') chartDataMap[key].failed++;
        }
      });

      const chartData = Object.keys(chartDataMap).sort().map(key => {
        const point = chartDataMap[key];
        const fRate = point.outbound > 0 ? (point.failed / point.outbound) * 100 : 0;
        return {
          label: resolution === 'hour' ? key.substring(11, 16) : key,
          fullDate: key,
          inbound: point.inbound,
          outbound: point.outbound,
          failureRate: parseFloat(fRate.toFixed(2))
        };
      });

      return {
        overview: {
          totalMessages: totalOutbound + inboundCount,
          deliveryRate: parseFloat(deliveryRate.toFixed(2)) || 0,
          readRate: parseFloat(readRate.toFixed(2)) || 0,
          replyRate: parseFloat(replyRate.toFixed(2)) || 0,
          failureRate: parseFloat(failureRate.toFixed(2)) || 0,
        },
        messages: {
          outbound: totalOutbound,
          inbound: inboundCount,
          avgResponseTime: '2.5m',
        },
        summary: {
          activeCampaigns,
          totalCampaigns,
          uniqueContacts,
          totalRecipients: totalOutbound,
        },
        chartData,
      };
    } catch (error) {
      this.logger.error(`Failed to get analytics overview: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getCampaignsAnalytics(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string) {
    // Sanitize
    if (typeof accountContext === 'string' && (accountContext === 'null' || accountContext === 'undefined' || accountContext === 'all' || !accountContext.trim())) {
      accountContext = undefined;
    }

    const where: any = { organizationId: orgId };

    // Standard campaign listing - organizational view fallback for stability
    // TODO: Implement safe metadata filtering once specific account logic is finalized

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }
    
    return this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getExportData(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string) {
    // Sanitize
    if (typeof accountContext === 'string' && (accountContext === 'null' || accountContext === 'undefined' || accountContext === 'all' || !accountContext.trim())) {
      accountContext = undefined;
    }

    const where: any = { organizationId: orgId };

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    const campaigns = await this.prisma.campaign.findMany({
      where,
      include: {
        _count: {
          select: { recipients: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      templateName: c.templateName || 'None',
      sent: c.sentCount,
      delivered: c.deliveredCount,
      read: c.readCount,
      failed: c.failedCount,
      totalRecipients: c._count.recipients,
      createdAt: c.createdAt.toISOString()
    }));
  }
}
