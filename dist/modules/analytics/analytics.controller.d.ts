import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getOverview(req: any, query: AnalyticsQueryDto): Promise<{
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
    getCampaigns(req: any, query: AnalyticsQueryDto): Promise<{
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
        metadata: import("@prisma/client/runtime/library").JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        templateName: string | null;
        templateParams: import("@prisma/client/runtime/library").JsonValue;
        scheduledAt: Date | null;
        totalRecipients: number;
        sentCount: number;
        deliveredCount: number;
        readCount: number;
        failedCount: number;
        responseCount: number;
    }[]>;
    getAutomations(req: any, query: AnalyticsQueryDto): Promise<{
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
    exportData(req: any, query: AnalyticsQueryDto): Promise<{
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
