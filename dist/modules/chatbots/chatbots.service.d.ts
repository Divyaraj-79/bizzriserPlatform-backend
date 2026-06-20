import { PrismaService } from '../../prisma/prisma.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';
import { TestRequestDto } from './dto/test-request.dto';
export declare class ChatbotsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(orgId: string): Promise<{
        chatbots: {
            id: string;
            organizationId: string;
            name: string;
            description: string | null;
            channel: import(".prisma/client").$Enums.ChatbotChannel;
            triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
            status: import(".prisma/client").$Enums.ChatbotStatus;
            keywords: string[];
            flowData: import("@prisma/client/runtime/library").JsonValue;
            executions: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        stats: {
            total: number;
            active: number;
            inactive: number;
        };
    }>;
    findOne(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(orgId: string, dto: CreateChatbotDto): Promise<{
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(orgId: string, id: string, dto: UpdateChatbotDto): Promise<{
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(orgId: string, id: string): Promise<{
        message: string;
    }>;
    activate(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deactivate(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    clone(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    executeTestRequest(dto: TestRequestDto): Promise<{
        status: any;
        statusText: any;
        data: any;
        headers: any;
    }>;
    exportChatbotData(orgId: string, id: string): Promise<Buffer>;
}
