import * as express from 'express';
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
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
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
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
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
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
    }>;
    getConversations(req: any, section?: string, page?: string, limit?: string): Promise<{
        data: {
            contact: {
                isInWindow: boolean;
                windowExpiresAt: Date | null;
                id: string;
                phone: string;
                firstName: string | null;
                lastName: string | null;
                avatarUrl: string | null;
                createdAt: Date;
            };
            whatsappAccount: {
                id: string;
                displayName: string;
                phoneNumber: string;
            };
            id: string;
            organizationId: string;
            createdAt: Date;
            updatedAt: Date;
            whatsappAccountId: string;
            contactId: string;
            metadata: import("@prisma/client/runtime/library").JsonValue;
            lastMessageBody: string | null;
            lastMessageAt: Date;
            unreadCount: number;
            section: string;
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
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
        metadata: import("@prisma/client/runtime/library").JsonValue;
        lastMessageBody: string | null;
        lastMessageAt: Date;
        unreadCount: number;
        section: string;
    }>;
    getMessages(conversationId: string, req: any, search?: string): Promise<{
        id: string;
        organizationId: string;
        status: import(".prisma/client").$Enums.MessageStatus;
        createdAt: Date;
        updatedAt: Date;
        whatsappAccountId: string;
        contactId: string;
        waMessageId: string | null;
        direction: import(".prisma/client").$Enums.MessageDirection;
        type: import(".prisma/client").$Enums.MessageType;
        content: import("@prisma/client/runtime/library").JsonValue;
        metadata: import("@prisma/client/runtime/library").JsonValue;
        conversationId: string | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        failedAt: Date | null;
        failureReason: string | null;
    }[]>;
    clearMessages(id: string, req: any): Promise<{
        success: boolean;
    }>;
    markAsRead(id: string, req: any): Promise<any>;
    getMedia(mediaId: string, accountId: string, req: any, res: express.Response): Promise<void>;
}
