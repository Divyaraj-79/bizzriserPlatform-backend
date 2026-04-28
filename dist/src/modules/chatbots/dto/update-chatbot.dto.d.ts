import { ChatbotChannel, ChatbotTriggerType, ChatbotStatus } from '@prisma/client';
export declare class UpdateChatbotDto {
    name?: string;
    description?: string;
    channel?: ChatbotChannel;
    triggerType?: ChatbotTriggerType;
    status?: ChatbotStatus;
    keywords?: string[];
    flowData?: Record<string, any>;
    executions?: number;
}
