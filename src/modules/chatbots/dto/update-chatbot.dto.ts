import { IsString, IsEnum, IsOptional, IsArray, IsObject, IsNumber } from 'class-validator';
import { ChatbotChannel, ChatbotTriggerType, ChatbotStatus } from '@prisma/client';

export class UpdateChatbotDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ChatbotChannel)
  @IsOptional()
  channel?: ChatbotChannel;

  @IsEnum(ChatbotTriggerType)
  @IsOptional()
  triggerType?: ChatbotTriggerType;

  @IsEnum(ChatbotStatus)
  @IsOptional()
  status?: ChatbotStatus;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsObject()
  @IsOptional()
  flowData?: Record<string, any>;

  @IsNumber()
  @IsOptional()
  executions?: number;
}
