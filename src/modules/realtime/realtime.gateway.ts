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
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
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
      this.logger.debug(`[Socket] New connection attempt: ${socket.id}`);

      if (!token) {
        this.logger.warn(`[Socket] Connection rejected: No token (ID: ${socket.id})`);
        socket.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const orgId = payload.orgId;

      if (!orgId) {
        this.logger.warn(`[Socket] Connection rejected: Missing orgId in token (User: ${payload.sub})`);
        socket.disconnect();
        return;
      }

      // Store data in socket
      socket.data.orgId = orgId;
      socket.data.userId = payload.sub;

      // Join organization room
      await socket.join(`org_${orgId}`);
      
      this.logger.log(`[Socket] Client Authenticated & Joined Room: org_${orgId} (User: ${payload.sub}, Socket: ${socket.id})`);
    } catch (error) {
      this.logger.error(`[Socket] Auth Failed for socket ${socket.id}: ${error.message}`);
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
    if (this.server) {
      this.server.to(`org_${orgId}`).emit('message:new', message);
      this.logger.log(`[RT] Emitted message:new to org_${orgId} - MsgID: ${message.id}`);
    } else {
      this.logger.error(`[RT] FAILED to emit message:new - Server not initialized!`);
    }
  }

  /**
   * Helper method to emit a 'message:status' event to a specific organization.
   */
  emitMessageStatusUpdate(orgId: string, message: any) {
    if (this.server) {
      this.server.to(`org_${orgId}`).emit('message:status', message);
      this.logger.log(`[RT] Emitted message:status to org_${orgId} - Status: ${message.status}`);
    }
  }

  /**
   * Helper method to emit 'conversation:updated' event.
   */
  emitConversationUpdate(orgId: string, conversation: any) {
    if (this.server) {
      this.server.to(`org_${orgId}`).emit('conversation:update', conversation);
      this.logger.log(`[RT] Emitted conversation:update to org_${orgId} - ConvID: ${conversation.id}`);
    }
  }

  /**
   * Emits campaign updates to instantly refresh campaign stats.
   */
  emitCampaignUpdate(orgId: string, campaign: any) {
    if (this.server) {
      this.server.to(`org_${orgId}`).emit('campaign:update', campaign);
    }
  }

  /**
   * Emits real-time progress for bulk contact imports.
   */
  emitImportProgress(orgId: string, jobId: string, stats: any) {
    if (this.server) {
      this.server.to(`org_${orgId}`).emit('import:progress', { jobId, ...stats });
    }
  }

  /**
   * Emits contact updates to instantly refresh CRM tables.
   */
  emitContactUpdate(orgId: string, eventName: 'contact:created' | 'contact:updated', contact: any) {
    if (this.server) {
      this.server.to(`org_${orgId}`).emit(eventName, contact);
    }
  }


  @SubscribeMessage('subscribe:conversation')
  handleJoinConversation(socket: Socket, conversationId: string) {
    // Optionally allow deeper subscription to specific conversation threads
    socket.join(`conversation_${conversationId}`);
    return { status: 'subscribed', conversationId };
  }
}
