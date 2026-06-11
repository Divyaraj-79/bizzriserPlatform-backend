import { SequencesService } from './sequences.service';
import { CreateSequenceDto, UpdateSequenceDto, CreateSequenceStepDto } from './dto/sequences.dto';
export declare class SequencesController {
    private readonly sequencesService;
    constructor(sequencesService: SequencesService);
    getSequences(req: any): Promise<({
        _count: {
            enrollments: number;
            steps: number;
        };
    } & {
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        triggerType: string;
        executions: number;
        triggerValue: string | null;
    })[]>;
    getSequence(req: any, id: string): Promise<{
        _count: {
            enrollments: number;
        };
        steps: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            sequenceId: string;
            orderIndex: number;
            delayAmount: number;
            delayUnit: string;
            actionType: string;
            actionData: import("@prisma/client/runtime/library").JsonValue;
        }[];
    } & {
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        triggerType: string;
        executions: number;
        triggerValue: string | null;
    }>;
    createSequence(req: any, data: CreateSequenceDto): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        triggerType: string;
        executions: number;
        triggerValue: string | null;
    }>;
    updateSequence(req: any, id: string, data: UpdateSequenceDto): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        triggerType: string;
        executions: number;
        triggerValue: string | null;
    }>;
    deleteSequence(req: any, id: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.SequenceStatus;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        description: string | null;
        triggerType: string;
        executions: number;
        triggerValue: string | null;
    }>;
    createStep(req: any, id: string, data: CreateSequenceStepDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        orderIndex: number;
        delayAmount: number;
        delayUnit: string;
        actionType: string;
        actionData: import("@prisma/client/runtime/library").JsonValue;
    }>;
    updateStep(req: any, sequenceId: string, stepId: string, data: Partial<CreateSequenceStepDto>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        orderIndex: number;
        delayAmount: number;
        delayUnit: string;
        actionType: string;
        actionData: import("@prisma/client/runtime/library").JsonValue;
    }>;
    deleteStep(req: any, sequenceId: string, stepId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        sequenceId: string;
        orderIndex: number;
        delayAmount: number;
        delayUnit: string;
        actionType: string;
        actionData: import("@prisma/client/runtime/library").JsonValue;
    }>;
    enrollContact(req: any, sequenceId: string, contactId: string, accountId: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.SequenceEnrollmentStatus;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
        startedAt: Date;
        completedAt: Date | null;
        contactId: string;
        currentStepIndex: number;
        nextExecuteAt: Date | null;
        sequenceId: string;
    }>;
}
