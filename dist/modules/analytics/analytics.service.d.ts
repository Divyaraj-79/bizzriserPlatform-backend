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
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
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
    }[]>;
    getAutomationsAnalytics(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<{
        chatbots: {
            id: string;
            status: import(".prisma/client").$Enums.ChatbotStatus;
            updatedAt: Date;
            name: string;
            executions: number;
        }[];
        sequences: {
            id: string;
            status: import(".prisma/client").$Enums.SequenceStatus;
            updatedAt: Date;
            name: string;
            executions: number;
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
