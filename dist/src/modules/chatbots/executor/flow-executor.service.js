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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var FlowExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowExecutorService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const whatsapp_service_1 = require("../../whatsapp/whatsapp.service");
const axios_1 = __importDefault(require("axios"));
let FlowExecutorService = FlowExecutorService_1 = class FlowExecutorService {
    prisma;
    whatsappService;
    delayQueue;
    logger = new common_1.Logger(FlowExecutorService_1.name);
    constructor(prisma, whatsappService, delayQueue) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
        this.delayQueue = delayQueue;
    }
    async startSession(orgId, accountId, chatbot, contact, messageData) {
        this.logger.log(`Starting flow ${chatbot.id} for contact ${contact.phone}`);
        const flowData = chatbot.flowData;
        if (!flowData?.nodes?.length)
            return;
        const triggerNode = flowData.nodes.find((n) => n.type === 'triggerNode' || n.data?.isTrigger) || flowData.nodes[0];
        const session = await this.prisma.chatbotSession.create({
            data: {
                organizationId: orgId,
                chatbotId: chatbot.id,
                contactId: contact.id,
                accountId,
                currentNodeId: triggerNode.id,
                status: client_1.ChatbotSessionStatus.ACTIVE,
                variables: {},
            },
        });
        await this.advanceFromNode(session, triggerNode, flowData.edges || [], flowData.nodes, contact, messageData);
    }
    async resumeSession(session, contact, messageData) {
        this.logger.log(`Resuming session ${session.id} for contact ${contact.phone}`);
        const flowData = (await this.prisma.chatbot.findUnique({ where: { id: session.chatbotId } }))?.flowData;
        if (!flowData)
            return;
        const currentNode = flowData.nodes.find((n) => n.id === session.currentNodeId);
        if (!currentNode) {
            await this.markCompleted(session.id);
            return;
        }
        const waitingType = session.waitingNodeType;
        let variables = (session.variables || {});
        let routeHandle = undefined;
        if (waitingType === 'ask') {
            const config = currentNode.data?.config || {};
            const varName = config.variableName || config.saveToVariable;
            if (varName) {
                const userInput = messageData.text?.body ?? messageData.interactive?.button_reply?.title ?? messageData.interactive?.list_reply?.title ?? '';
                if (varName.startsWith('custom.')) {
                    const fieldName = varName.replace('custom.', '');
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: userInput } },
                    });
                    variables = { ...variables, [varName]: userInput };
                }
                else if (varName.startsWith('var.')) {
                    const name = varName.replace('var.', '');
                    variables = { ...variables, [name]: userInput };
                }
                else {
                    variables = { ...variables, [varName]: userInput };
                }
                await this.prisma.chatbotSession.update({
                    where: { id: session.id },
                    data: { variables },
                });
            }
            routeHandle = 'output';
        }
        else if (waitingType === 'button') {
            const buttonId = messageData.interactive?.button_reply?.id ?? messageData.button?.payload ?? '';
            const varName = currentNode.data?.config?.saveToVariable;
            if (varName) {
                if (varName.startsWith('custom.')) {
                    const fieldName = varName.replace('custom.', '');
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: buttonId } },
                    });
                    variables = { ...variables, [varName]: buttonId };
                }
                else {
                    const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
                    variables = { ...variables, [name]: buttonId };
                }
                await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
            }
            routeHandle = buttonId ? `btn_${buttonId}` : 'output';
        }
        else if (waitingType === 'list') {
            const listId = messageData.interactive?.list_reply?.id ?? '';
            const varName = currentNode.data?.config?.saveToVariable;
            if (varName) {
                if (varName.startsWith('custom.')) {
                    const fieldName = varName.replace('custom.', '');
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: listId } },
                    });
                    variables = { ...variables, [varName]: listId };
                }
                else {
                    const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
                    variables = { ...variables, [name]: listId };
                }
                await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
            }
            routeHandle = listId ? `list_${listId}` : 'output';
        }
        const updatedSession = await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: { status: client_1.ChatbotSessionStatus.ACTIVE, waitingForInput: false, waitingNodeType: null },
        });
        await this.advanceFromNode({ ...updatedSession, variables }, currentNode, flowData.edges || [], flowData.nodes, contact, messageData, routeHandle);
    }
    async executeNode(session, node, edges, allNodes, contact, messageData) {
        this.logger.debug(`Executing node type=${node.type} id=${node.id}`);
        try {
            switch (node.type) {
                case 'sendText': return await this.handleSendText(session, node, edges, allNodes, contact, messageData);
                case 'sendButton': return await this.handleSendButton(session, node, edges, allNodes, contact, messageData);
                case 'sendList': return await this.handleSendList(session, node, edges, allNodes, contact, messageData);
                case 'sendMedia': return await this.handleSendMedia(session, node, edges, allNodes, contact, messageData);
                case 'sendTemplate': return await this.handleSendTemplate(session, node, edges, allNodes, contact, messageData);
                case 'askQuestion':
                case 'askText':
                case 'askNumber':
                case 'askEmail':
                case 'askDate': return await this.handleAskQuestion(session, node, edges, allNodes, contact, messageData);
                case 'delay': return await this.handleDelay(session, node, edges, allNodes, contact, messageData);
                case 'condition': return await this.handleCondition(session, node, edges, allNodes, contact, messageData);
                case 'jumpTo': return await this.handleJumpTo(session, node, edges, allNodes, contact, messageData);
                case 'updateField': return await this.handleUpdateField(session, node, edges, allNodes, contact, messageData);
                case 'updateLabel': return await this.handleUpdateLabel(session, node, edges, allNodes, contact, messageData);
                case 'assignTeam': return await this.handleAssignTeam(session, node, edges, allNodes, contact, messageData);
                case 'resolveConversation': return await this.handleResolveConversation(session, node);
                case 'httpApi': return await this.handleHttpApi(session, node, edges, allNodes, contact, messageData);
                case 'triggerNode':
                default:
                    return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
            }
        }
        catch (err) {
            this.logger.error(`Node execution error [${node.type}:${node.id}]: ${err.message}`);
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
        }
    }
    async handleSendText(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        let text = await this.resolveVariables(config.text || '', session, contact, messageData);
        if (text) {
            await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, text);
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleAskQuestion(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || config.text || '', session, contact, messageData);
        if (question) {
            await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'ask',
                currentNodeId: node.id,
            },
        });
    }
    async handleSendButton(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const bodyText = await this.resolveVariables(config.body || config.text || 'Please choose an option:', session, contact, messageData);
        const headerText = config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined;
        const footerText = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
        const buttons = (config.buttons || []).slice(0, 3).map((b) => ({
            id: b.id || b.payload || b.title,
            title: b.title || b.label,
        }));
        if (buttons.length > 0) {
            await this.whatsappService.sendInteractiveButtons(session.organizationId, session.accountId, contact.phone, bodyText, buttons, headerText, footerText);
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'button',
                currentNodeId: node.id,
            },
        });
    }
    async handleSendList(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const bodyText = await this.resolveVariables(config.body || 'Please select an option:', session, contact, messageData);
        const buttonText = config.buttonText || 'View Options';
        const headerText = config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined;
        const footerText = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
        const sections = (config.sections || []).map((s) => ({
            title: s.title || 'Options',
            rows: (s.rows || s.items || []).map((r) => ({
                id: r.id || r.payload || r.title,
                title: r.title,
                description: r.description,
            })),
        }));
        if (sections.length > 0) {
            await this.whatsappService.sendInteractiveList(session.organizationId, session.accountId, contact.phone, bodyText, buttonText, sections, headerText, footerText);
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'list',
                currentNodeId: node.id,
            },
        });
    }
    async handleSendMedia(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const mediaType = config.mediaType || 'image';
        const caption = config.caption ? await this.resolveVariables(config.caption, session, contact, messageData) : undefined;
        if (config.mediaUrl) {
            await this.whatsappService.sendMediaByUrl(session.organizationId, session.accountId, contact.phone, mediaType, config.mediaUrl, caption, config.filename);
        }
        else if (config.mediaId) {
            const typeMap = { image: 'IMAGE', video: 'VIDEO', document: 'DOCUMENT', audio: 'AUDIO' };
            await this.whatsappService.sendMediaMessage(session.organizationId, session.accountId, contact.phone, typeMap[mediaType], config.mediaId, caption);
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleSendTemplate(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        if (!config.templateName) {
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
        }
        const components = [];
        if (config.bodyParams?.length) {
            const params = await Promise.all(config.bodyParams.map(async (p) => ({
                type: 'text',
                text: await this.resolveVariables(p, session, contact, messageData),
            })));
            components.push({ type: 'body', parameters: params });
        }
        await this.whatsappService.sendTemplateMessage(session.organizationId, session.accountId, contact.phone, config.templateName, config.language || 'en_US', components);
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleDelay(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const amount = parseInt(config.delayAmount || config.amount || '5', 10);
        const unit = config.delayUnit || config.unit || 'seconds';
        const unitMs = {
            seconds: 1000,
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
        };
        const delayMs = amount * (unitMs[unit] || 1000);
        const outEdge = edges.find(e => e.source === node.id);
        const nextNodeId = outEdge?.target;
        if (!nextNodeId) {
            return await this.markCompleted(session.id);
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: false,
                currentNodeId: nextNodeId,
                expiresAt: new Date(Date.now() + delayMs),
            },
        });
        await this.delayQueue.add('resume-after-delay', { sessionId: session.id, nextNodeId, organizationId: session.organizationId, accountId: session.accountId, contactId: session.contactId }, { delay: delayMs });
    }
    async handleCondition(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const conditions = config.conditions || [];
        const logicType = config.logicType || 'AND';
        const results = await Promise.all(conditions.map(c => this.evaluateCondition(c, session, contact, messageData)));
        const passed = logicType === 'AND' ? results.every(Boolean) : results.some(Boolean);
        const handle = passed ? 'success' : 'fail';
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, handle);
    }
    async evaluateCondition(condition, session, contact, messageData) {
        const { source, operator, value, valueType } = condition;
        let actual = null;
        if (source === 'Last Message Received') {
            actual = messageData.text?.body ?? messageData.interactive?.button_reply?.title ?? messageData.interactive?.list_reply?.title ?? '';
        }
        else if (source?.startsWith('custom.') || source === 'Contact/Custom Field') {
            const fieldKey = condition.fieldKey || source.replace('custom.', '');
            const customFields = contact.customFields || {};
            actual = customFields[fieldKey] ?? null;
        }
        else if (source?.startsWith('var.')) {
            const varKey = source.replace('var.', '');
            actual = (session.variables || {})[varKey] ?? null;
        }
        else if (source === 'contact.firstName') {
            actual = contact.firstName ?? null;
        }
        else if (source === 'contact.email') {
            actual = contact.email ?? null;
        }
        if (actual === null && operator !== 'Is Empty')
            return false;
        let expected = value;
        if (valueType === 'Custom/Contact Field' && value) {
            if (value.startsWith('custom.')) {
                const fieldKey = value.replace('custom.', '');
                const customFields = contact.customFields || {};
                expected = customFields[fieldKey] ?? null;
            }
            else if (value === 'contact.firstName') {
                expected = contact.firstName ?? null;
            }
            else if (value === 'contact.email') {
                expected = contact.email ?? null;
            }
            else if (value.startsWith('var.')) {
                const varKey = value.replace('var.', '');
                expected = (session.variables || {})[varKey] ?? null;
            }
        }
        const a = (actual ?? '').toLowerCase();
        const v = (expected ?? '').toLowerCase();
        switch (operator) {
            case 'Equals (=)': return a === v;
            case 'Not Equals (!=)': return a !== v;
            case 'Contains': return a.includes(v);
            case 'Does Not Contain': return !a.includes(v);
            case 'Starts With': return a.startsWith(v);
            case 'Ends With': return a.endsWith(v);
            case 'Is Empty': return !actual || actual.trim() === '';
            case 'Is Not Empty': return !!actual && actual.trim() !== '';
            case 'Greater Than (>)': return parseFloat(a) > parseFloat(v);
            case 'Less Than (<)': return parseFloat(a) < parseFloat(v);
            default: return a === v;
        }
    }
    async handleJumpTo(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const targetNodeId = config.targetNodeId;
        if (!targetNodeId)
            return await this.markCompleted(session.id);
        const targetNode = allNodes.find(n => n.id === targetNodeId);
        if (!targetNode)
            return await this.markCompleted(session.id);
        await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { currentNodeId: targetNodeId } });
        await this.executeNode({ ...session, currentNodeId: targetNodeId }, targetNode, edges, allNodes, contact, messageData);
    }
    async handleUpdateField(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const fieldName = config.fieldName;
        const fieldValue = await this.resolveVariables(config.fieldValue || '', session, contact, messageData);
        if (fieldName) {
            const currentFields = contact.customFields || {};
            await this.prisma.contact.update({
                where: { id: contact.id },
                data: { customFields: { ...currentFields, [fieldName]: fieldValue } },
            });
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleUpdateLabel(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const action = config.action || 'add';
        const tag = config.tag || config.label || '';
        if (tag) {
            const currentTags = contact.tags || [];
            const newTags = action === 'add'
                ? [...new Set([...currentTags, tag])]
                : currentTags.filter(t => t !== tag);
            await this.prisma.contact.update({ where: { id: contact.id }, data: { tags: newTags } });
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleAssignTeam(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const agentId = config.agentId;
        if (agentId) {
            await this.prisma.contact.update({ where: { id: contact.id }, data: { agentId } });
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleResolveConversation(session, node) {
        await this.markCompleted(session.id);
    }
    async handleHttpApi(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        if (!config.url)
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
        const url = await this.resolveVariables(config.url, session, contact, messageData);
        const bodyRaw = config.body ? await this.resolveVariables(config.body, session, contact, messageData) : undefined;
        const params = {};
        for (const p of (config.queryParams || [])) {
            if (p.key)
                params[p.key] = await this.resolveVariables(p.value || '', session, contact, messageData);
        }
        const headers = {};
        for (const h of (config.headers || [])) {
            if (h.key)
                headers[h.key] = await this.resolveVariables(h.value || '', session, contact, messageData);
        }
        if (config.auth?.type === 'Bearer' && config.auth.value) {
            headers['Authorization'] = `Bearer ${config.auth.value}`;
        }
        else if (config.auth?.type === 'API Key' && config.auth.key) {
            headers[config.auth.key] = config.auth.value;
        }
        let responseData = {};
        try {
            const res = await (0, axios_1.default)({
                method: config.method || 'GET',
                url,
                params,
                headers,
                data: config.method !== 'GET' && bodyRaw ? JSON.parse(bodyRaw) : undefined,
                timeout: 15000,
            });
            responseData = res.data;
        }
        catch (err) {
            this.logger.error(`HttpApi node error: ${err.message}`);
            responseData = {};
        }
        let variables = (session.variables || {});
        for (const mapping of (config.mappings || [])) {
            if (!mapping.jsonPath || !mapping.storeIn)
                continue;
            const extracted = this.extractJsonPath(responseData, mapping.jsonPath);
            if (mapping.storeIn.startsWith('custom.')) {
                const fieldName = mapping.storeIn.replace('custom.', '');
                const currentFields = contact.customFields || {};
                await this.prisma.contact.update({
                    where: { id: contact.id },
                    data: { customFields: { ...currentFields, [fieldName]: extracted } },
                });
            }
            else if (mapping.storeIn.startsWith('var.')) {
                variables[mapping.storeIn.replace('var.', '')] = extracted;
            }
            else {
                variables[mapping.storeIn] = extracted;
            }
        }
        await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
        await this.advanceFromNode({ ...session, variables }, node, edges, allNodes, contact, messageData, 'output');
    }
    async resolveVariables(template, session, contact, messageData) {
        if (!template)
            return '';
        const sessionVars = (session.variables || {});
        const customFields = contact.customFields || {};
        return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
            if (key.startsWith('var.'))
                return String(sessionVars[key.slice(4)] ?? match);
            if (key.startsWith('custom.'))
                return String(customFields[key.slice(7)] ?? match);
            if (key.startsWith('contact.')) {
                const field = key.slice(8);
                return String(contact[field] ?? match);
            }
            if (key === 'message.text')
                return messageData?.text?.body || '';
            const parts = key.split('.');
            let val = { contact, var: sessionVars, custom: customFields, message: { text: messageData?.text?.body } };
            for (const p of parts) {
                val = val?.[p];
                if (val === undefined)
                    break;
            }
            return val !== undefined ? String(val) : match;
        });
    }
    async advanceFromNode(session, node, edges, allNodes, contact, messageData, sourceHandle) {
        let outEdges = edges.filter(e => e.source === node.id);
        if (sourceHandle) {
            const specific = outEdges.filter(e => e.sourceHandle === sourceHandle);
            outEdges = specific.length > 0 ? specific : outEdges.filter(e => !e.sourceHandle);
        }
        if (outEdges.length === 0) {
            this.logger.log(`Flow end reached at node ${node.id}`);
            return await this.markCompleted(session.id);
        }
        const nextNodeId = outEdges[0].target;
        const nextNode = allNodes.find(n => n.id === nextNodeId);
        if (!nextNode)
            return await this.markCompleted(session.id);
        await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { currentNodeId: nextNodeId } });
        await this.executeNode({ ...session, currentNodeId: nextNodeId }, nextNode, edges, allNodes, contact, messageData);
    }
    async markCompleted(sessionId) {
        await this.prisma.chatbotSession.update({
            where: { id: sessionId },
            data: { status: client_1.ChatbotSessionStatus.COMPLETED },
        });
    }
    extractJsonPath(obj, path) {
        try {
            const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
            let val = obj;
            for (const p of parts) {
                if (val === null || val === undefined)
                    break;
                val = val[p];
            }
            return val ?? '';
        }
        catch {
            return '';
        }
    }
};
exports.FlowExecutorService = FlowExecutorService;
exports.FlowExecutorService = FlowExecutorService = FlowExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)('flow-delays')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService,
        bullmq_1.Queue])
], FlowExecutorService);
//# sourceMappingURL=flow-executor.service.js.map