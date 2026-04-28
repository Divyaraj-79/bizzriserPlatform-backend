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
        chartData: {
            label: string;
            fullDate: string;
            inbound: number;
            outbound: number;
            failureRate: number;
        }[];
    }>;
    getCampaigns(req: any, query: AnalyticsQueryDto): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.CampaignStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
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
    }[]>;
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
