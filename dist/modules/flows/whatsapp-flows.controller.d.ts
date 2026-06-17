import { WhatsAppFlowsService } from './whatsapp-flows.service';
export declare class WhatsAppFlowsController {
    private readonly flowsService;
    constructor(flowsService: WhatsAppFlowsService);
    createFlow(req: any, body: {
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
    listFlows(req: any): Promise<{
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
    getFlow(req: any, id: string): Promise<{
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
    updateFlow(req: any, id: string, body: any): Promise<{
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
    deleteFlow(req: any, id: string): Promise<{
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
    getSubmissions(req: any, id: string): Promise<({
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
    exportFlow(req: any, id: string, res: any): Promise<void>;
    publishFlow(req: any, id: string, body: {
        accountId: string;
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
}
