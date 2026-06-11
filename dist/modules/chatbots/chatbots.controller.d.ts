import { ChatbotsService } from './chatbots.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';
import { TestRequestDto } from './dto/test-request.dto';
export declare class ChatbotsController {
    private readonly chatbotsService;
    constructor(chatbotsService: ChatbotsService);
    findAll(req: any): Promise<{
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
    create(req: any, dto: CreateChatbotDto): Promise<{
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
    findOne(req: any, id: string): Promise<{
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
    update(req: any, id: string, dto: UpdateChatbotDto): Promise<{
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
    remove(req: any, id: string): Promise<{
        message: string;
    }>;
    activate(req: any, id: string): Promise<{
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
    deactivate(req: any, id: string): Promise<{
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
    clone(req: any, id: string): Promise<{
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
    testRequest(dto: TestRequestDto): Promise<{
        status: any;
        statusText: any;
        data: any;
        headers: any;
    }>;
}
