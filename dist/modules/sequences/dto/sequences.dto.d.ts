import { SequenceStatus } from '@prisma/client';
export declare class CreateSequenceDto {
    name: string;
    description?: string;
    triggerType?: string;
    triggerValue?: string;
}
export declare class UpdateSequenceDto {
    name?: string;
    description?: string;
    status?: SequenceStatus;
    triggerType?: string;
    triggerValue?: string;
}
export declare class CreateSequenceStepDto {
    orderIndex: number;
    delayAmount: number;
    delayUnit: string;
    actionType: string;
    actionData: Record<string, any>;
}
