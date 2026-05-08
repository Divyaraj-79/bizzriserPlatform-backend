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
        waMessageId: string | null;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    sendMedia(req: any, body: {
        accountId: string;
        contactId: string;
        caption?: string;
    }, file: any): Promise<{
        id: string;
        waMessageId: string | null;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    sendTemplate(req: any, body: {
        accountId: string;
        contactId: string;
        templateName: string;
        language?: string;
        components?: any[];
    }): Promise<{
        id: string;
        waMessageId: string | null;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        createdAt: Date;
        updatedAt: Date;
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
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        unreadCount: number;
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
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        unreadCount: number;
    }>;
    getMessages(conversationId: string, req: any, search?: string): Promise<{
        id: string;
        waMessageId: string | null;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        status: import(".prisma/client").$Enums.MessageStatus;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    clearMessages(id: string, req: any): Promise<{
        success: boolean;
    }>;
    markAsRead(id: string, req: any): Promise<{
        whatsappAccount: {
            id: string;
            phoneNumber: string;
            displayName: string;
        };
        contact: {
            id: string;
            createdAt: Date;
            phone: string;
            firstName: string | null;
            lastName: string | null;
            avatarUrl: string | null;
        };
    } & {
        id: string;
        organizationId: string;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        unreadCount: number;
    }>;
}
