"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const ExcelJS = __importStar(require("exceljs"));
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
    async exportChatbotData(orgId, id) {
        await this.findOne(orgId, id);
        const sessions = await this.prisma.chatbotSession.findMany({
            where: { chatbotId: id, organizationId: orgId },
            include: { contact: true },
            orderBy: { createdAt: 'desc' },
        });
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'BizzRiser';
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet('Chatbot Data');
        const variableKeys = new Set();
        for (const session of sessions) {
            const vars = session.variables;
            if (vars) {
                Object.keys(vars).forEach(key => variableKeys.add(key));
            }
        }
        const dynamicColumns = Array.from(variableKeys).sort();
        const columns = [
            { header: 'Session ID', key: 'id', width: 36 },
            { header: 'Contact Name', key: 'contactName', width: 25 },
            { header: 'Contact Phone', key: 'contactPhone', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Created At', key: 'createdAt', width: 25 },
        ];
        dynamicColumns.forEach(col => {
            columns.push({ header: col, key: col, width: 25 });
        });
        worksheet.columns = columns;
        worksheet.getRow(1).font = { bold: true };
        sessions.forEach(session => {
            const contactFullName = session.contact ? `${session.contact.firstName || ''} ${session.contact.lastName || ''}`.trim() : '';
            const rowData = {
                id: session.id,
                contactName: contactFullName || 'Unknown',
                contactPhone: session.contact?.phone || 'Unknown',
                status: session.status,
                createdAt: session.createdAt.toLocaleString(),
            };
            const vars = session.variables;
            if (vars) {
                dynamicColumns.forEach(key => {
                    const val = vars[key];
                    rowData[key] = typeof val === 'object' ? JSON.stringify(val) : val;
                });
            }
            worksheet.addRow(rowData);
        });
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }
};
exports.ChatbotsService = ChatbotsService;
exports.ChatbotsService = ChatbotsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ChatbotsService);
//# sourceMappingURL=chatbots.service.js.map