import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSequenceDto, UpdateSequenceDto, CreateSequenceStepDto } from './dto/sequences.dto';
import { Queue } from 'bullmq';
export declare class SequencesService implements OnModuleInit {
    private prisma;
    private sequencesQueue;
    private readonly logger;
    constructor(prisma: PrismaService, sequencesQueue: Queue);
    onModuleInit(): void;
    private startSequencePoller;
    createSequence(orgId: string, data: CreateSequenceDto): Promise<{
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
    getSequences(orgId: string): Promise<({
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
    getSequence(orgId: string, id: string): Promise<{
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
    updateSequence(orgId: string, id: string, data: UpdateSequenceDto): Promise<{
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
    deleteSequence(orgId: string, id: string): Promise<{
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
    createStep(orgId: string, sequenceId: string, data: CreateSequenceStepDto): Promise<{
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
    updateStep(orgId: string, sequenceId: string, stepId: string, data: Partial<CreateSequenceStepDto>): Promise<{
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
    deleteStep(orgId: string, sequenceId: string, stepId: string): Promise<{
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
    enrollContact(orgId: string, sequenceId: string, contactId: string, accountId: string): Promise<{
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
    cancelEnrollment(orgId: string, enrollmentId: string): Promise<{
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
    private calculateNextExecution;
}
