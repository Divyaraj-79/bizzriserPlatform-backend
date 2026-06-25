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
class TtlCache {
    store = new Map();
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    invalidate(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix))
                this.store.delete(key);
        }
    }
}
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    prisma;
    logger = new common_1.Logger(AnalyticsService_1.name);
    cache = new TtlCache();
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOverview(orgId, accountContext, startDate, endDate) {
        try {
            const cacheKey = `overview:${orgId}:${Array.isArray(accountContext) ? accountContext.join(',') : accountContext}:${startDate}:${endDate}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.logger.debug('[Analytics] Cache HIT for overview');
                return cached;
            }
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
            const chartMessageWhere = { ...messageWhere };
            if (!startDate && !endDate) {
                chartMessageWhere.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
            }
            const [messageStats, recentPairs, campaignStats, uniqueContacts, chatbotStats, sequenceStats, recentMessages] = await Promise.all([
                this.prisma.message.groupBy({
                    by: ['direction', 'status'],
                    where: messageWhere,
                    _count: { id: true },
                }),
                this.prisma.message.findMany({
                    where: messageWhere,
                    orderBy: { createdAt: 'desc' },
                    take: 100,
                    select: { createdAt: true, direction: true, contactId: true }
                }),
                this.prisma.campaign.groupBy({
                    by: ['status'],
                    where: campaignWhere,
                    _count: { id: true },
                }),
                this.prisma.contact.count({
                    where: { organizationId: orgId },
                }),
                this.prisma.chatbot.aggregate({
                    where: { organizationId: orgId },
                    _count: { id: true },
                    _sum: { executions: true }
                }),
                this.prisma.sequence.aggregate({
                    where: { organizationId: orgId },
                    _count: { id: true },
                    _sum: { executions: true }
                }),
                this.prisma.message.findMany({
                    where: chartMessageWhere,
                    select: { createdAt: true, direction: true, status: true },
                    take: 1000
                })
            ]);
            let totalOutbound = 0;
            let inboundCount = 0;
            let delivered = 0;
            let read = 0;
            let failed = 0;
            messageStats.forEach((stat) => {
                const count = stat._count.id || 0;
                if (stat.direction === 'INBOUND') {
                    inboundCount += count;
                }
                else {
                    totalOutbound += count;
                    if (stat.status === 'DELIVERED' || stat.status === 'READ')
                        delivered += count;
                    if (stat.status === 'READ')
                        read += count;
                    if (stat.status === 'FAILED')
                        failed += count;
                }
            });
            const deliveryRate = totalOutbound > 0 ? (delivered / totalOutbound) * 100 : 0;
            const readRate = totalOutbound > 0 ? (read / totalOutbound) * 100 : 0;
            const replyRate = totalOutbound > 0 ? (inboundCount / totalOutbound) * 100 : 0;
            const failureRate = totalOutbound > 0 ? (failed / totalOutbound) * 100 : 0;
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
            let activeCampaigns = 0;
            let totalCampaigns = 0;
            campaignStats.forEach((c) => {
                const count = c._count.id || 0;
                totalCampaigns += count;
                if (c.status === 'RUNNING' || c.status === 'SCHEDULED') {
                    activeCampaigns += count;
                }
            });
            const totalChatbots = chatbotStats._count.id || 0;
            const chatbotExecutions = chatbotStats._sum.executions || 0;
            const totalSequences = sequenceStats._count.id || 0;
            const sequenceExecutions = sequenceStats._sum.executions || 0;
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
            const result = {
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
                    chatbotExecutions: chatbotExecutions || 0,
                    totalSequences,
                    sequenceExecutions: sequenceExecutions || 0,
                    totalAutomations: (chatbotExecutions || 0) + (sequenceExecutions || 0)
                },
                chartData,
            };
            this.cache.set(cacheKey, result, 45_000);
            return result;
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
        const cacheKey = `campaigns:${orgId}:${startDate}:${endDate}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.logger.debug('[Analytics] Cache HIT for campaigns');
            return cached;
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
        const result = campaigns.map(c => {
            const total = c.totalRecipients || 0;
            return {
                ...c,
                deliveryRate: total > 0 ? parseFloat(((c.deliveredCount / total) * 100).toFixed(2)) : 0,
                readRate: total > 0 ? parseFloat(((c.readCount / total) * 100).toFixed(2)) : 0,
                failureRate: total > 0 ? parseFloat(((c.failedCount / total) * 100).toFixed(2)) : 0,
            };
        });
        this.cache.set(cacheKey, result, 30_000);
        return result;
    }
    async getAutomationsAnalytics(orgId, accountContext, startDate, endDate) {
        const cacheKey = `automations:${orgId}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.logger.debug('[Analytics] Cache HIT for automations');
            return cached;
        }
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
        const result = { chatbots, sequences };
        this.cache.set(cacheKey, result, 60_000);
        return result;
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