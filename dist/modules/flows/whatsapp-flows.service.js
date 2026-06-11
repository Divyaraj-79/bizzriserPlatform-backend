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
var WhatsAppFlowsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppFlowsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const client_1 = require("@prisma/client");
const ExcelJS = __importStar(require("exceljs"));
let WhatsAppFlowsService = WhatsAppFlowsService_1 = class WhatsAppFlowsService {
    prisma;
    whatsapp;
    logger = new common_1.Logger(WhatsAppFlowsService_1.name);
    constructor(prisma, whatsapp) {
        this.prisma = prisma;
        this.whatsapp = whatsapp;
    }
    async createFlow(orgId, data) {
        return this.prisma.whatsAppFlow.create({
            data: {
                organizationId: orgId,
                name: data.name,
                description: data.description,
                categories: data.categories || ['OTHER'],
                definition: {},
            },
        });
    }
    async getFlow(orgId, id) {
        const flow = await this.prisma.whatsAppFlow.findFirst({
            where: { id, organizationId: orgId },
            include: { submissions: { take: 5, orderBy: { submittedAt: 'desc' } } }
        });
        if (!flow)
            throw new common_1.NotFoundException('Flow not found');
        return flow;
    }
    async listFlows(orgId) {
        return this.prisma.whatsAppFlow.findMany({
            where: { organizationId: orgId },
            orderBy: { updatedAt: 'desc' },
        });
    }
    async updateFlow(orgId, id, data) {
        const flow = await this.getFlow(orgId, id);
        if (flow.status === client_1.WhatsAppFlowStatus.PUBLISHED && data.definition) {
            throw new common_1.ConflictException('Cannot update definition of a PUBLISHED flow. Please create a new version.');
        }
        return this.prisma.whatsAppFlow.update({
            where: { id },
            data,
        });
    }
    async publishFlow(orgId, id, accountId) {
        const flow = await this.getFlow(orgId, id);
        return this.prisma.whatsAppFlow.update({
            where: { id },
            data: {
                status: client_1.WhatsAppFlowStatus.PUBLISHED,
            },
        });
    }
    async deleteFlow(orgId, id) {
        const flow = await this.getFlow(orgId, id);
        if (flow.status === client_1.WhatsAppFlowStatus.PUBLISHED) {
        }
        return this.prisma.whatsAppFlow.delete({ where: { id } });
    }
    async getSubmissions(orgId, flowId) {
        return this.prisma.whatsAppFlowSubmission.findMany({
            where: { flowId, organizationId: orgId },
            include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
            orderBy: { submittedAt: 'desc' },
        });
    }
    async handleFlowSubmission(orgId, flowId, contactId, data) {
        const submission = await this.prisma.whatsAppFlowSubmission.create({
            data: {
                organizationId: orgId,
                flowId,
                contactId,
                data,
            }
        });
        const customFields = await this.prisma.customField.findMany({ where: { organizationId: orgId } });
        const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
        if (contact) {
            const existingData = contact.customFields || {};
            const newData = { ...existingData };
            Object.keys(data).forEach(key => {
                const field = customFields.find(f => f.name.toLowerCase() === key.toLowerCase());
                if (field) {
                    newData[field.name] = data[key];
                }
            });
            await this.prisma.contact.update({
                where: { id: contactId },
                data: { customFields: newData }
            });
        }
        return submission;
    }
    async exportSubmissionsToExcel(orgId, flowId) {
        const flow = await this.getFlow(orgId, flowId);
        const submissions = await this.getSubmissions(orgId, flowId);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Submissions');
        const allKeys = new Set();
        submissions.forEach((s) => {
            const data = s.data;
            Object.keys(data).forEach(k => allKeys.add(k));
        });
        const columns = [
            { header: 'Submitted At', key: 'submittedAt', width: 25 },
            { header: 'Phone', key: 'phone', width: 20 },
            { header: 'Contact Name', key: 'name', width: 25 },
            ...Array.from(allKeys).map(k => ({ header: k, key: k, width: 20 }))
        ];
        worksheet.columns = columns;
        submissions.forEach((s) => {
            const data = s.data;
            const row = {
                submittedAt: s.submittedAt.toISOString(),
                phone: s.contact.phone,
                name: `${s.contact.firstName || ''} ${s.contact.lastName || ''}`.trim(),
                ...data
            };
            worksheet.addRow(row);
        });
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEEEEEE' }
        };
        return workbook.xlsx.writeBuffer();
    }
};
exports.WhatsAppFlowsService = WhatsAppFlowsService;
exports.WhatsAppFlowsService = WhatsAppFlowsService = WhatsAppFlowsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService])
], WhatsAppFlowsService);
//# sourceMappingURL=whatsapp-flows.service.js.map