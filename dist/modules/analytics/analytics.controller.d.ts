import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getOverview(req: any, query: AnalyticsQueryDto): Promise<any>;
    getCampaigns(req: any, query: AnalyticsQueryDto): Promise<any>;
    getAutomations(req: any, query: AnalyticsQueryDto): Promise<any>;
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
