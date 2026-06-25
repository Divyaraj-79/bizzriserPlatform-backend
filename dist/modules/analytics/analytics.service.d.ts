import { PrismaService } from '../../prisma/prisma.service';
export declare class AnalyticsService {
    private readonly prisma;
    private readonly logger;
    private readonly cache;
    constructor(prisma: PrismaService);
    getOverview(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<any>;
    getCampaignsAnalytics(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<any>;
    getAutomationsAnalytics(orgId: string, accountContext?: string | string[], startDate?: string, endDate?: string): Promise<any>;
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
