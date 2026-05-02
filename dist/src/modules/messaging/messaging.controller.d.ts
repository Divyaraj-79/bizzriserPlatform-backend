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
        status: import(".prisma/client").$Enums.MessageStatus;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
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
        status: import(".prisma/client").$Enums.MessageStatus;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
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
        status: import(".prisma/client").$Enums.MessageStatus;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }>;
    getConversations(req: any): Promise<({
        contact: {
            id: string;
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
    } & {
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue;
    })[]>;
    createConversation(req: any, body: {
        whatsappAccountId: string;
        phoneNumber: string;
        firstName?: string;
        lastName?: string;
    }): Promise<{
        id: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue;
    }>;
    getMessages(conversationId: string, req: any): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.MessageStatus;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        content: import("@prisma/client/runtime/library").JsonValue;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
        conversationId: string | null;
    }[]>;
}
