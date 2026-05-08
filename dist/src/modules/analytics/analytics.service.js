"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    prisma;
    logger = new common_1.Logger(AnalyticsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOverview(orgId, accountContext, startDate, endDate) {
        try {
            const isInvalid = (val) => typeof val === 'string' &&
                (val === 'null' || val === 'undefined' || val === 'all' || !val.trim());
            if (isInvalid(accountContext)) {
                accountContext = undefined;
            }
            const messageWhere = { organizationId: orgId };
            const campaignWhere = { organizationId: orgId };
            if (accountContext) {
                if (Array.isArray(accountContext)) {
                    messageWhere.whatsappAccountId = { in: accountContext };
                }
                else {
                    messageWhere.whatsappAccountId = accountContext;
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
            const messageStats = await this.prisma.message.groupBy({
                by: ['status'],
                where: { ...messageWhere, direction: 'OUTBOUND' },
                _count: { id: true },
            });
            const inboundCount = await this.prisma.message.count({
                where: { ...messageWhere, direction: 'INBOUND' },
            });
            let totalOutbound = 0;
            let delivered = 0;
            let read = 0;
            let failed = 0;
            messageStats.forEach((stat) => {
                const count = stat._count.id || 0;
                totalOutbound += count;
                if (stat.status === 'DELIVERED' || stat.status === 'READ')
                    delivered += count;
                if (stat.status === 'READ')
                    read += count;
                if (stat.status === 'FAILED')
                    failed += count;
            });
            const deliveryRate = totalOutbound > 0 ? (delivered / totalOutbound) * 100 : 0;
            const readRate = totalOutbound > 0 ? (read / totalOutbound) * 100 : 0;
            const replyRate = totalOutbound > 0 ? (inboundCount / totalOutbound) * 100 : 0;
            const failureRate = totalOutbound > 0 ? (failed / totalOutbound) * 100 : 0;
            const recentPairs = await this.prisma.message.findMany({
                where: messageWhere,
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: { createdAt: true, direction: true, contactId: true }
            });
            let totalResponseTime = 0;
            let responseCount = 0;
            for (let i = 0; i < recentPairs.length - 1; i++) {
                const current = recentPairs[i];
                const next = recentPairs[i + 1];
                if (current.direction === 'OUTBOUND' && next.direction === 'INBOUND' && current.contactId === next.contactId) {
                    const diff = current.createdAt.getTime() - next.createdAt.getTime();
                    if (diff > 0 && diff < 1000 * 60 * 60 * 2) {
                        totalResponseTime += diff;
                        responseCount++;
                    }
                }
            }
            const avgResponseMs = responseCount > 0 ? totalResponseTime / responseCount : 0;
            const avgResponseMin = Math.round(avgResponseMs / (1000 * 60) * 10) / 10;
            const avgResponseLabel = avgResponseMin > 0 ? `${avgResponseMin}m` : (responseCount > 0 ? '< 1m' : 'N/A');
            const activeCampaigns = await this.prisma.campaign.count({
                where: { ...campaignWhere, status: { in: ['RUNNING', 'SCHEDULED'] } },
            });
            const totalCampaigns = await this.prisma.campaign.count({
                where: campaignWhere,
            });
            const uniqueContacts = await this.prisma.contact.count({
                where: { organizationId: orgId },
            });
            const totalChatbots = await this.prisma.chatbot.count({ where: { organizationId: orgId } });
            const chatbotExecutions = await this.prisma.chatbot.aggregate({
                where: { organizationId: orgId },
                _sum: { executions: true }
            });
            const totalSequences = await this.prisma.sequence.count({ where: { organizationId: orgId } });
            const sequenceExecutions = await this.prisma.sequence.aggregate({
                where: { organizationId: orgId },
                _sum: { executions: true }
            });
            const recentMessages = await this.prisma.message.findMany({
                where: messageWhere,
                select: { createdAt: true, direction: true, status: true }
            });
            const end = endDate ? new Date(endDate) : new Date();
            const start = startDate ? new Date(startDate) : new Date();
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 0;
            const resolution = diffDays <= 2 ? 'hour' : 'day';
            const chartDataMap = {};
            recentMessages.forEach(msg => {
                let key = msg.createdAt.toISOString().split('T')[0];
                if (resolution === 'hour')
                    key = msg.createdAt.toISOString().substring(0, 13) + ':00';
                if (!chartDataMap[key])
                    chartDataMap[key] = { inbound: 0, outbound: 0, failed: 0 };
                if (msg.direction === 'INBOUND')
                    chartDataMap[key].inbound++;
                else {
                    chartDataMap[key].outbound++;
                    if (msg.status === 'FAILED')
                        chartDataMap[key].failed++;
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
                    avgResponseTime: avgResponseLabel,
                },
                summary: {
                    activeCampaigns,
                    totalCampaigns,
                    uniqueContacts,
                    totalRecipients: totalOutbound,
                },
                automations: {
                    totalChatbots,
                    chatbotExecutions: chatbotExecutions._sum.executions || 0,
                    totalSequences,
                    sequenceExecutions: sequenceExecutions._sum.executions || 0,
                    totalAutomations: (chatbotExecutions._sum.executions || 0) + (sequenceExecutions._sum.executions || 0)
                },
                chartData,
            };
        }
        catch (error) {
            this.logger.error(`Failed to get analytics overview: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getCampaignsAnalytics(orgId, accountContext, startDate, endDate) {
        if (typeof accountContext === 'string' && (accountContext === 'null' || accountContext === 'undefined' || accountContext === 'all' || !accountContext.trim())) {
            accountContext = undefined;
        }
        const where = { organizationId: orgId };
        if (startDate || endDate) {
            where.createdAt = {
                ...(startDate && { gte: new Date(startDate) }),
                ...(endDate && { lte: new Date(endDate) }),
            };
        }
        const campaigns = await this.prisma.campaign.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        return campaigns.map(c => {
            const total = c.totalRecipients || 0;
            return {
                ...c,
                deliveryRate: total > 0 ? parseFloat(((c.deliveredCount / total) * 100).toFixed(2)) : 0,
                readRate: total > 0 ? parseFloat(((c.readCount / total) * 100).toFixed(2)) : 0,
                failureRate: total > 0 ? parseFloat(((c.failedCount / total) * 100).toFixed(2)) : 0,
            };
        });
    }
    async getAutomationsAnalytics(orgId, accountContext, startDate, endDate) {
        const [chatbots, sequences] = await Promise.all([
            this.prisma.chatbot.findMany({
                where: { organizationId: orgId },
                select: { id: true, name: true, executions: true, status: true, updatedAt: true }
            }),
            this.prisma.sequence.findMany({
                where: { organizationId: orgId },
                select: { id: true, name: true, executions: true, status: true, updatedAt: true }
            })
        ]);
        return { chatbots, sequences };
    }
    async getExportData(orgId, accountContext, startDate, endDate) {
        if (typeof accountContext === 'string' && (accountContext === 'null' || accountContext === 'undefined' || accountContext === 'all' || !accountContext.trim())) {
            accountContext = undefined;
        }
        const where = { organizationId: orgId };
        if (startDate || endDate) {
            where.createdAt = {
                ...(startDate && { gte: new Date(startDate) }),
                ...(endDate && { lte: new Date(endDate) }),
            };
        }
        const campaigns = await this.prisma.campaign.findMany({
            where,
            include: { _count: { select: { recipients: true } } },
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
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = AnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map