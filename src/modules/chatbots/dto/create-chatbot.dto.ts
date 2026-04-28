import { IsString, IsEnum, IsOptional, IsArray, MinLength } from 'class-validator';
import { ChatbotChannel, ChatbotTriggerType } from '@prisma/client';

export class CreateChatbotDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ChatbotChannel)
  channel: ChatbotChannel;

  @IsEnum(ChatbotTriggerType)
  triggerType: ChatbotTriggerType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];
}
