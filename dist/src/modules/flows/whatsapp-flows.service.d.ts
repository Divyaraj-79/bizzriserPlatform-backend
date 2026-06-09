import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import * as ExcelJS from 'exceljs';
export declare class WhatsAppFlowsService {
    private readonly prisma;
    private readonly whatsapp;
    private readonly logger;
    constructor(prisma: PrismaService, whatsapp: WhatsappService);
    createFlow(orgId: string, data: {
        name: string;
        description?: string;
        categories?: string[];
    }): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppFlowStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        version: number;
        flowId: string | null;
        definition: import("@prisma/client/runtime/library").JsonValue;
        categories: string[];
    }>;
    getFlow(orgId: string, id: string): Promise<{
        submissions: {
            id: string;
            organizationId: string;
            data: import("@prisma/client/runtime/library").JsonValue;
            contactId: string;
            flowId: string;
            submittedAt: Date;
        }[];
    } & {
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppFlowStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        version: number;
        flowId: string | null;
        definition: import("@prisma/client/runtime/library").JsonValue;
        categories: string[];
    }>;
    listFlows(orgId: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppFlowStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        version: number;
        flowId: string | null;
        definition: import("@prisma/client/runtime/library").JsonValue;
        categories: string[];
    }[]>;
    updateFlow(orgId: string, id: string, data: {
        name?: string;
        description?: string;
        definition?: any;
    }): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppFlowStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        version: number;
        flowId: string | null;
        definition: import("@prisma/client/runtime/library").JsonValue;
        categories: string[];
    }>;
    publishFlow(orgId: string, id: string, accountId: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppFlowStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        version: number;
        flowId: string | null;
        definition: import("@prisma/client/runtime/library").JsonValue;
        categories: string[];
    }>;
    deleteFlow(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.WhatsAppFlowStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        version: number;
        flowId: string | null;
        definition: import("@prisma/client/runtime/library").JsonValue;
        categories: string[];
    }>;
    getSubmissions(orgId: string, flowId: string): Promise<({
        contact: {
            phone: string;
            firstName: string | null;
            lastName: string | null;
        };
    } & {
        id: string;
        organizationId: string;
        data: import("@prisma/client/runtime/library").JsonValue;
        contactId: string;
        flowId: string;
        submittedAt: Date;
    })[]>;
    handleFlowSubmission(orgId: string, flowId: string, contactId: string, data: any): Promise<{
        id: string;
        organizationId: string;
        data: import("@prisma/client/runtime/library").JsonValue;
        contactId: string;
        flowId: string;
        submittedAt: Date;
    }>;
    exportSubmissionsToExcel(orgId: string, flowId: string): Promise<ExcelJS.Buffer>;
}
