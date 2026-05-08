import { MessagingService } from './messaging.service';
export declare class MessagingController {
    private readonly messagingService;
    constructor(messagingService: MessagingService);
    sendMessage(req: any, body: {
        accountId: string;
        contactId: string;
        text: string;
    }): Promise<{
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }>;
    sendMedia(req: any, body: {
        accountId: string;
        contactId: string;
        caption?: string;
    }, file: any): Promise<{
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }>;
    sendTemplate(req: any, body: {
        accountId: string;
        contactId: string;
        templateName: string;
        language?: string;
        components?: any[];
    }): Promise<{
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }>;
    getConversations(req: any): Promise<{
        contact: {
            isInWindow: boolean;
            windowExpiresAt: Date | null;
            id: string;
            createdAt: Date;
            phone: string;
            firstName: string | null;
            lastName: string | null;
            avatarUrl: string | null;
        };
        whatsappAccount: {
            id: string;
            phoneNumber: string;
            displayName: string;
        };
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    createConversation(req: any, body: {
        whatsappAccountId: string;
        phoneNumber: string;
        firstName?: string;
        lastName?: string;
    }): Promise<{
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getMessages(conversationId: string, req: any, search?: string): Promise<{
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }[]>;
    clearMessages(id: string, req: any): Promise<{
        success: boolean;
    }>;
}
