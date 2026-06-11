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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
let ChatbotsService = class ChatbotsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(orgId) {
        const [chatbots, total, active, inactive] = await Promise.all([
            this.prisma.chatbot.findMany({
                where: { organizationId: orgId },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.chatbot.count({ where: { organizationId: orgId } }),
            this.prisma.chatbot.count({ where: { organizationId: orgId, status: client_1.ChatbotStatus.ACTIVE } }),
            this.prisma.chatbot.count({
                where: {
                    organizationId: orgId,
                    status: { in: [client_1.ChatbotStatus.INACTIVE, client_1.ChatbotStatus.DRAFT] },
                },
            }),
        ]);
        return {
            chatbots,
            stats: { total, active, inactive },
        };
    }
    async findOne(orgId, id) {
        const chatbot = await this.prisma.chatbot.findFirst({
            where: { id, organizationId: orgId },
        });
        if (!chatbot) {
            throw new common_1.NotFoundException(`ChatBOT with ID "${id}" not found.`);
        }
        return chatbot;
    }
    async create(orgId, dto) {
        return this.prisma.chatbot.create({
            data: {
                organizationId: orgId,
                name: dto.name,
                description: dto.description,
                channel: dto.channel,
                triggerType: dto.triggerType,
                keywords: dto.keywords ?? [],
                status: client_1.ChatbotStatus.DRAFT,
                flowData: {},
            },
        });
    }
    async update(orgId, id, dto) {
        await this.findOne(orgId, id);
        return this.prisma.chatbot.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.channel !== undefined && { channel: dto.channel }),
                ...(dto.triggerType !== undefined && { triggerType: dto.triggerType }),
                ...(dto.status !== undefined && { status: dto.status }),
                ...(dto.keywords !== undefined && { keywords: dto.keywords }),
                ...(dto.flowData !== undefined && { flowData: dto.flowData }),
                ...(dto.executions !== undefined && { executions: dto.executions }),
            },
        });
    }
    async remove(orgId, id) {
        await this.findOne(orgId, id);
        await this.prisma.chatbot.delete({ where: { id } });
        return { message: 'ChatBOT deleted successfully.' };
    }
    async activate(orgId, id) {
        await this.findOne(orgId, id);
        return this.prisma.chatbot.update({
            where: { id },
            data: { status: client_1.ChatbotStatus.ACTIVE },
        });
    }
    async deactivate(orgId, id) {
        await this.findOne(orgId, id);
        return this.prisma.chatbot.update({
            where: { id },
            data: { status: client_1.ChatbotStatus.INACTIVE },
        });
    }
    async clone(orgId, id) {
        const original = await this.findOne(orgId, id);
        return this.prisma.chatbot.create({
            data: {
                organizationId: orgId,
                name: `${original.name} (Copy)`,
                description: original.description,
                channel: original.channel,
                triggerType: original.triggerType,
                keywords: original.keywords,
                flowData: original.flowData,
                status: client_1.ChatbotStatus.DRAFT,
            },
        });
    }
    async executeTestRequest(dto) {
        const { method, url, queryParams, headers, body } = dto;
        const params = {};
        queryParams?.forEach(p => {
            if (p.key)
                params[p.key] = p.value;
        });
        const axiosHeaders = {};
        headers?.forEach(h => {
            if (h.key)
                axiosHeaders[h.key] = h.value;
        });
        try {
            const response = await (0, axios_1.default)({
                method,
                url,
                params,
                headers: axiosHeaders,
                data: body,
                timeout: 10000,
            });
            return {
                status: response.status,
                statusText: response.statusText,
                data: response.data,
                headers: response.headers,
            };
        }
        catch (error) {
            return {
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Internal Server Error',
                data: error.response?.data || { message: error.message },
                headers: error.response?.headers || {},
            };
        }
    }
};
exports.ChatbotsService = ChatbotsService;
exports.ChatbotsService = ChatbotsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ChatbotsService);
//# sourceMappingURL=chatbots.service.js.map