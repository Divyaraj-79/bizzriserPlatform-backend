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
            socket.data.orgId = orgId;
            socket.data.userId = payload.sub;
            await socket.join(`org_${orgId}`);
            this.logger.log(`Client authenticated: User ${payload.sub} (Org: ${orgId})`);
        }
        catch (error) {
            this.logger.error(`Connection authentication failed: ${error.message}`);
            socket.disconnect();
        }
    }
    handleDisconnect(socket) {
        this.logger.log(`Client disconnected: ${socket.id}`);
    }
    emitNewMessage(orgId, message) {
        this.server.to(`org_${orgId}`).emit('message:new', message);
        this.logger.debug(`Emitted 'message:new' to org_${orgId}`);
    }
    emitMessageStatusUpdate(orgId, message) {
        this.server.to(`org_${orgId}`).emit('message:status', message);
        this.logger.debug(`Emitted 'message:status' to org_${orgId}`);
    }
    emitConversationUpdate(orgId, conversation) {
        this.server.to(`org_${orgId}`).emit('conversation:update', conversation);
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
        },
        namespace: 'realtime',
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map