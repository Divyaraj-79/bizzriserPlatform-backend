import { PrismaService } from '../../prisma/prisma.service';
export declare class AnalyticsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getOverview(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<{
        overview: {
            totalMessages: number;
            deliveryRate: number;
            readRate: number;
            replyRate: number;
            failureRate: number;
        };
        messages: {
            outbound: number;
            inbound: number;
            avgResponseTime: string;
        };
        summary: {
            activeCampaigns: number;
            totalCampaigns: number;
            uniqueContacts: number;
            totalRecipients: number;
        };
        automations: {
            totalChatbots: number;
            chatbotExecutions: number;
            totalSequences: number;
            sequenceExecutions: number;
            totalAutomations: number;
        };
        chartData: {
            label: string;
            fullDate: string;
            inbound: number;
            outbound: number;
            failureRate: number;
        }[];
    }>;
    getCampaignsAnalytics(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<{
        deliveryRate: number;
        readRate: number;
        failureRate: number;
        organizationId: string;
        id: string;
        name: string;
        description: string | null;
        status: import(".prisma/client").$Enums.CampaignStatus;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
        responseCount: number;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getAutomationsAnalytics(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<{
        chatbots: {
            executions: number;
            id: string;
            name: string;
            status: import(".prisma/client").$Enums.ChatbotStatus;
            updatedAt: Date;
        }[];
        sequences: {
            executions: number;
            id: string;
            name: string;
            status: import(".prisma/client").$Enums.SequenceStatus;
            updatedAt: Date;
        }[];
    }>;
    getExportData(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<{
        id: string;
        name: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        templateName: string;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
        totalRecipients: number;
        createdAt: string;
    }[]>;
}
