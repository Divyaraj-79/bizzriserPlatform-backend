import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*', // In production, replace with actual frontend URL
  },
  namespace: 'realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Handles individual client connections and authenticates via JWT.
   */
  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        this.logger.warn(`Client connection rejected: No token provided (Socket ID: ${socket.id})`);
        socket.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const orgId = payload.orgId;

      if (!orgId) {
        this.logger.warn(`Client connection rejected: Missing orgId in payload`);
        socket.disconnect();
        return;
      }

      // Store orgId in socket data for later use
      socket.data.orgId = orgId;
      socket.data.userId = payload.sub;

      // Join organization room
      await socket.join(`org_${orgId}`);
      
      this.logger.log(`Client authenticated: User ${payload.sub} (Org: ${orgId})`);
    } catch (error) {
      this.logger.error(`Connection authentication failed: ${error.message}`);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.log(`Client disconnected: ${socket.id}`);
  }

  /**
   * Helper method to emit a 'message:new' event to a specific organization.
   */
  emitNewMessage(orgId: string, message: any) {
    this.server.to(`org_${orgId}`).emit('message:new', message);
    this.logger.debug(`Emitted 'message:new' to org_${orgId}`);
  }

  /**
   * Helper method to emit a 'message:status' event to a specific organization.
   */
  emitMessageStatusUpdate(orgId: string, message: any) {
    this.server.to(`org_${orgId}`).emit('message:status', message);
    this.logger.debug(`Emitted 'message:status' to org_${orgId}`);
  }

  /**
   * Helper method to emit 'conversation:updated' event.
   */
  emitConversationUpdate(orgId: string, conversation: any) {
    this.server.to(`org_${orgId}`).emit('conversation:update', conversation);
  }

  @SubscribeMessage('subscribe:conversation')
  handleJoinConversation(socket: Socket, conversationId: string) {
    // Optionally allow deeper subscription to specific conversation threads
    socket.join(`conversation_${conversationId}`);
    return { status: 'subscribed', conversationId };
  }
}
