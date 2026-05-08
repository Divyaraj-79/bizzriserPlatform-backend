"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RealtimeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    jwtService;
    server;
    logger = new common_1.Logger(RealtimeGateway_1.name);
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    async handleConnection(socket) {
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
            socket.data.orgId = orgId;
            socket.data.userId = payload.sub;
            await socket.join(`org_${orgId}`);
            this.logger.log(`[Socket] Client Authenticated & Joined Room: org_${orgId} (User: ${payload.sub}, Socket: ${socket.id})`);
        }
        catch (error) {
            this.logger.error(`[Socket] Auth Failed for socket ${socket.id}: ${error.message}`);
            socket.disconnect();
        }
    }
    handleDisconnect(socket) {
        this.logger.log(`Client disconnected: ${socket.id}`);
    }
    emitNewMessage(orgId, message) {
        if (this.server) {
            this.server.to(`org_${orgId}`).emit('message:new', message);
            this.logger.log(`[RT] Emitted message:new to org_${orgId} - MsgID: ${message.id}`);
        }
        else {
            this.logger.error(`[RT] FAILED to emit message:new - Server not initialized!`);
        }
    }
    emitMessageStatusUpdate(orgId, message) {
        if (this.server) {
            this.server.to(`org_${orgId}`).emit('message:status', message);
            this.logger.log(`[RT] Emitted message:status to org_${orgId} - Status: ${message.status}`);
        }
    }
    emitConversationUpdate(orgId, conversation) {
        if (this.server) {
            this.server.to(`org_${orgId}`).emit('conversation:update', conversation);
            this.logger.log(`[RT] Emitted conversation:update to org_${orgId} - ConvID: ${conversation.id}`);
        }
    }
    emitImportProgress(orgId, jobId, stats) {
        if (this.server) {
            this.server.to(`org_${orgId}`).emit('import:progress', { jobId, ...stats });
        }
    }
    emitContactUpdate(orgId, eventName, contact) {
        if (this.server) {
            this.server.to(`org_${orgId}`).emit(eventName, contact);
        }
    }
    handleJoinConversation(socket, conversationId) {
        socket.join(`conversation_${conversationId}`);
        return { status: 'subscribed', conversationId };
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe:conversation'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, String]),
    __metadata("design:returntype", void 0)
], RealtimeGateway.prototype, "handleJoinConversation", null);
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map