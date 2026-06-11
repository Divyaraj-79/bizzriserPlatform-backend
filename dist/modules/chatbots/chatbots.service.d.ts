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
            status: import(".prisma/client").$Enums.ChatbotStatus;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            description: string | null;
            channel: import(".prisma/client").$Enums.ChatbotChannel;
            triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
            keywords: string[];
            flowData: import("@prisma/client/runtime/library").JsonValue;
            executions: number;
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
        status: import(".prisma/client").$Enums.ChatbotStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
    }>;
    create(orgId: string, dto: CreateChatbotDto): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
    }>;
    update(orgId: string, id: string, dto: UpdateChatbotDto): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
    }>;
    remove(orgId: string, id: string): Promise<{
        message: string;
    }>;
    activate(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
    }>;
    deactivate(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
    }>;
    clone(orgId: string, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.ChatbotStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        channel: import(".prisma/client").$Enums.ChatbotChannel;
        triggerType: import(".prisma/client").$Enums.ChatbotTriggerType;
        keywords: string[];
        flowData: import("@prisma/client/runtime/library").JsonValue;
        executions: number;
    }>;
    executeTestRequest(dto: TestRequestDto): Promise<{
        status: any;
        statusText: any;
        data: any;
        headers: any;
    }>;
}
