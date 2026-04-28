import { IsString, IsOptional, IsEnum, IsInt, IsObject } from 'class-validator';
import { SequenceStatus } from '@prisma/client';

export class CreateSequenceDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  triggerType?: string; // MANUAL | ON_CONTACT_CREATED | ON_TAG_ADDED

  @IsString()
  @IsOptional()
  triggerValue?: string;
}

export class UpdateSequenceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(SequenceStatus)
  @IsOptional()
  status?: SequenceStatus;

  @IsString()
  @IsOptional()
  triggerType?: string;

  @IsString()
  @IsOptional()
  triggerValue?: string;
}

export class CreateSequenceStepDto {
  @IsInt()
  orderIndex: number;

  @IsInt()
  delayAmount: number;

  @IsString()
  delayUnit: string;

  @IsString()
  actionType: string;

  @IsObject()
  actionData: Record<string, any>;
}
