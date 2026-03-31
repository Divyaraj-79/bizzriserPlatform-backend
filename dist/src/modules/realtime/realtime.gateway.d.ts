import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
export declare class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly jwtService;
    server: Server;
    private readonly logger;
    constructor(jwtService: JwtService);
    handleConnection(socket: Socket): Promise<void>;
    handleDisconnect(socket: Socket): void;
    emitNewMessage(orgId: string, message: any): void;
    emitMessageStatusUpdate(orgId: string, message: any): void;
    emitConversationUpdate(orgId: string, conversation: any): void;
    handleJoinConversation(socket: Socket, conversationId: string): {
        status: string;
        conversationId: string;
    };
}
