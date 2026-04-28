import { ChatbotChannel, ChatbotTriggerType } from '@prisma/client';
export declare class CreateChatbotDto {
    name: string;
    description?: string;
    channel: ChatbotChannel;
    triggerType: ChatbotTriggerType;
    keywords?: string[];
}
