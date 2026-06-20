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
const messaging_service_1 = require("../../messaging/messaging.service");
const axios_1 = __importDefault(require("axios"));
const libphonenumber_js_1 = require("libphonenumber-js");
const uuid_1 = require("uuid");
const whatsapp_flows_service_1 = require("../../flows/whatsapp-flows.service");
const realtime_gateway_1 = require("../../realtime/realtime.gateway");
let FlowExecutorService = FlowExecutorService_1 = class FlowExecutorService {
    prisma;
    whatsappService;
    messagingService;
    flowsService;
    realtimeGateway;
    delayQueue;
    logger = new common_1.Logger(FlowExecutorService_1.name);
    constructor(prisma, whatsappService, messagingService, flowsService, realtimeGateway, delayQueue) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
        this.messagingService = messagingService;
        this.flowsService = flowsService;
        this.realtimeGateway = realtimeGateway;
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
        try {
            const updatedChatbot = await this.prisma.chatbot.update({
                where: { id: chatbot.id },
                data: { executions: { increment: 1 } },
            });
            this.realtimeGateway.emitChatbotUpdate(orgId, {
                id: chatbot.id,
                executions: updatedChatbot.executions,
            });
        }
        catch (e) {
            this.logger.error(`Failed to increment executions for chatbot ${chatbot.id}: ${e.message}`);
        }
        await this.executeNode(session, triggerNode, flowData.edges || [], flowData.nodes, contact, messageData);
    }
    async resumeSession(session, contact, messageData) {
        this.logger.log(`Resuming session ${session.id} for contact ${contact.phone}`);
        const flowData = (await this.prisma.chatbot.findUnique({ where: { id: session.chatbotId } }))?.flowData;
        if (!flowData)
            return;
        let currentNode = flowData.nodes.find((n) => n.id === session.currentNodeId);
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
        else if (waitingType === 'askText') {
            const config = currentNode.data?.config || {};
            const userInput = messageData.text?.body || '';
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            const varName = config.variableName || config.saveToVar;
            const isValid = userInput.trim().length > 0;
            if (isValid) {
                if (varName) {
                    const match = varName.match(/^\{\{(custom|var|contact)\.(.+)\}\}$/);
                    if (match) {
                        const [_, type, field] = match;
                        if (type === 'custom') {
                            const currentFields = contact.customFields || {};
                            await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [field]: userInput } } });
                            variables = { ...variables, [`custom.${field}`]: userInput };
                        }
                        else if (type === 'var') {
                            variables = { ...variables, [`var.${field}`]: userInput };
                        }
                        else if (type === 'contact') {
                            await this.prisma.contact.update({ where: { id: contact.id }, data: { [field]: userInput } });
                        }
                    }
                    else {
                        const currentFields = contact.customFields || {};
                        await this.prisma.contact.update({ where: { id: contact.id }, data: { customFields: { ...currentFields, [varName]: userInput } } });
                        variables = { ...variables, [`custom.${varName}`]: userInput };
                    }
                    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Invalid input. Please try again.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: {
                            metadata: { ...session.metadata, currentAttempt }
                        },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askNumber') {
            const config = currentNode.data?.config || {};
            const userInput = messageData.text?.body || '';
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            const fieldName = config.saveToVar;
            const isNumeric = !isNaN(parseFloat(userInput)) && isFinite(Number(userInput));
            if (isNumeric) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: parseFloat(userInput) } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: userInput };
                    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Invalid number. Please try again.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askDate') {
            const config = currentNode.data?.config || {};
            const userInput = messageData.text?.body || '';
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            const fieldName = config.saveToVar;
            const date = new Date(userInput);
            const isValidDate = !isNaN(date.getTime());
            if (isValidDate) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: date.toISOString() } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: date.toISOString().split('T')[0] };
                    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Invalid date format. Please try again.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askEmail') {
            const config = currentNode.data?.config || {};
            const userInput = messageData.text?.body || '';
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            const fieldName = config.saveToVar;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValidEmail = emailRegex.test(userInput.trim());
            if (isValidEmail) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: userInput.trim().toLowerCase() } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: userInput.trim().toLowerCase() };
                    await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Invalid email address. Please try again.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'button') {
            const buttonId = messageData.interactive?.button_reply?.id ?? messageData.button?.payload ?? '';
            const buttonTitle = messageData.interactive?.button_reply?.title ?? messageData.button?.text ?? buttonId;
            const varName = currentNode.data?.config?.saveToVariable;
            if (varName) {
                if (varName.startsWith('custom.')) {
                    const fieldName = varName.replace('custom.', '');
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: buttonTitle } },
                    });
                    variables = { ...variables, [varName]: buttonTitle };
                }
                else {
                    const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
                    variables = { ...variables, [name]: buttonTitle };
                }
            }
            const nodeLabel = currentNode.data?.label || 'Interactive';
            variables[`Interaction: ${nodeLabel}`] = buttonTitle;
            await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
            routeHandle = buttonId ? `btn_${buttonId}` : 'output';
        }
        else if (waitingType === 'list') {
            const listId = messageData.interactive?.list_reply?.id ?? '';
            const listTitle = messageData.interactive?.list_reply?.title ?? listId;
            const varName = currentNode.data?.config?.saveToVariable;
            if (varName) {
                if (varName.startsWith('custom.')) {
                    const fieldName = varName.replace('custom.', '');
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: listTitle } },
                    });
                    variables = { ...variables, [varName]: listTitle };
                }
                else {
                    const name = varName.startsWith('var.') ? varName.replace('var.', '') : varName;
                    variables = { ...variables, [name]: listTitle };
                }
            }
            const nodeLabel = currentNode.data?.label || 'List';
            variables[`List Selection: ${nodeLabel}`] = listTitle;
            await this.prisma.chatbotSession.update({ where: { id: session.id }, data: { variables } });
            routeHandle = listId ? `list_${listId}` : 'output';
            if (listId) {
                const targetRowNode = flowData.nodes.find((n) => n.type === 'listRow' && (n.data?.config?.rowId === listId || n.id === listId));
                if (targetRowNode) {
                    currentNode = targetRowNode;
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { currentNodeId: targetRowNode.id }
                    });
                    routeHandle = 'output';
                }
            }
        }
        else if (waitingType === 'askLocation') {
            const config = currentNode.data?.config || {};
            const location = messageData.location;
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            const fieldName = config.saveToVar;
            if (location && location.latitude && location.longitude) {
                const coordsStr = JSON.stringify({ latitude: location.latitude, longitude: location.longitude });
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: coordsStr } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: coordsStr };
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Please share your location pin to continue.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askAddress') {
            const config = currentNode.data?.config || {};
            const addressData = messageData.interactive?.address_message?.address_data;
            const fieldName = config.saveToVar;
            if (addressData) {
                const addressStr = JSON.stringify(addressData);
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: addressStr } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: addressStr };
                }
                routeHandle = 'submitted';
            }
            else {
                routeHandle = 'notSubmitted';
            }
        }
        else if (waitingType === 'askImage') {
            const config = currentNode.data?.config || {};
            const mediaId = messageData.image?.id;
            const fieldName = config.saveToVar;
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            if (mediaId) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: mediaId } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: mediaId };
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Please upload an image to continue.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askVideo') {
            const config = currentNode.data?.config || {};
            const mediaId = messageData.video?.id;
            const fieldName = config.saveToVar;
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            if (mediaId) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: mediaId } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: mediaId };
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Please upload a video to continue.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askAudio') {
            const config = currentNode.data?.config || {};
            const mediaId = messageData.audio?.id;
            const fieldName = config.saveToVar;
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            if (mediaId) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: mediaId } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: mediaId };
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Please send your audio message to continue.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'askFile') {
            const config = currentNode.data?.config || {};
            const mediaId = messageData.document?.id;
            const fieldName = config.saveToVar;
            const attemptLimit = config.attemptLimit || 3;
            const currentAttempt = (session.metadata?.currentAttempt || 0) + 1;
            if (mediaId) {
                if (fieldName) {
                    const currentFields = contact.customFields || {};
                    await this.prisma.contact.update({
                        where: { id: contact.id },
                        data: { customFields: { ...currentFields, [fieldName]: mediaId } },
                    });
                    variables = { ...variables, [`custom.${fieldName}`]: mediaId };
                }
                routeHandle = 'submitted';
            }
            else {
                if (currentAttempt < attemptLimit) {
                    const errorMsg = config.validationErrorMessage || 'Please upload the requested file to continue.';
                    await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, errorMsg);
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: { metadata: { ...session.metadata, currentAttempt } },
                    });
                    return;
                }
                else {
                    routeHandle = 'notSubmitted';
                }
            }
        }
        else if (waitingType === 'flow') {
            const config = currentNode.data?.config || {};
            const interactive = messageData.interactive;
            if (interactive?.type === 'nfm_reply') {
                try {
                    const responseJson = JSON.parse(interactive.nfm_reply.response_json || '{}');
                    if (config.flowId) {
                        await this.flowsService.handleFlowSubmission(session.organizationId, config.flowId, contact.id, responseJson);
                    }
                    routeHandle = 'submitted';
                }
                catch (err) {
                    this.logger.error(`Error parsing flow response: ${err.message}`);
                    routeHandle = 'notSubmitted';
                }
            }
            else {
                routeHandle = 'notSubmitted';
            }
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
            await this.executeNodeActions(contact, node);
            switch (node.type) {
                case 'sendData': return await this.handleSendData(session, node, edges, allNodes, contact, messageData);
                case 'sendText': return await this.handleSendText(session, node, edges, allNodes, contact, messageData);
                case 'sendContact': return await this.handleSendContact(session, node, edges, allNodes, contact, messageData);
                case 'sendLocation': return await this.handleSendLocation(session, node, edges, allNodes, contact, messageData);
                case 'sendCTAButton': return await this.handleSendCTAButton(session, node, edges, allNodes, contact, messageData);
                case 'sendFlow': return await this.handleSendFlow(session, node, edges, allNodes, contact, messageData);
                case 'sendCarousel': return await this.handleSendCarousel(session, node, edges, allNodes, contact, messageData);
                case 'sendCallRequest': return await this.handleSendCallRequest(session, node, edges, allNodes, contact, messageData);
                case 'sendButton': return await this.handleSendButton(session, node, edges, allNodes, contact, messageData);
                case 'sendList': return await this.handleSendList(session, node, edges, allNodes, contact, messageData);
                case 'sendListAdvanced': return await this.handleSendListAdvanced(session, node, edges, allNodes, contact, messageData);
                case 'sendMedia': return await this.handleSendMedia(session, node, edges, allNodes, contact, messageData);
                case 'sendTemplate': return await this.handleSendTemplate(session, node, edges, allNodes, contact, messageData);
                case 'sendPayment': return await this.handleSendPayment(session, node, edges, allNodes, contact, messageData);
                case 'interactive': return await this.handleInteractive(session, node, edges, allNodes, contact, messageData);
                case 'productSearch': return await this.handleProductSearch(session, node, edges, allNodes, contact, messageData);
                case 'productCategorization': return await this.handleProductCategorization(session, node, edges, allNodes, contact, messageData);
                case 'askText': return await this.handleAskText(session, node, edges, allNodes, contact, messageData);
                case 'askNumber': return await this.handleAskNumber(session, node, edges, allNodes, contact, messageData);
                case 'askDate': return await this.handleAskDate(session, node, edges, allNodes, contact, messageData);
                case 'askEmail': return await this.handleAskEmail(session, node, edges, allNodes, contact, messageData);
                case 'askLocation': return await this.handleAskLocation(session, node, edges, allNodes, contact, messageData);
                case 'askAddress': return await this.handleAskAddress(session, node, edges, allNodes, contact, messageData);
                case 'askImage': return await this.handleAskImage(session, node, edges, allNodes, contact, messageData);
                case 'askVideo': return await this.handleAskVideo(session, node, edges, allNodes, contact, messageData);
                case 'askAudio': return await this.handleAskAudio(session, node, edges, allNodes, contact, messageData);
                case 'askFile': return await this.handleAskFile(session, node, edges, allNodes, contact, messageData);
                case 'askQuestion': return await this.handleAskQuestion(session, node, edges, allNodes, contact, messageData);
                case 'delay': return await this.handleDelay(session, node, edges, allNodes, contact, messageData);
                case 'condition': return await this.handleCondition(session, node, edges, allNodes, contact, messageData);
                case 'jumpTo': return await this.handleJumpTo(session, node, edges, allNodes, contact, messageData);
                case 'updateField': return await this.handleUpdateField(session, node, edges, allNodes, contact, messageData);
                case 'updateLabel': return await this.handleUpdateLabel(session, node, edges, allNodes, contact, messageData);
                case 'updateSubscription': return await this.handleUpdateSubscription(session, node, edges, allNodes, contact, messageData);
                case 'assignTeam': return await this.handleAssignTeam(session, node, edges, allNodes, contact, messageData);
                case 'assignSequence': return await this.handleAssignSequence(session, node, edges, allNodes, contact, messageData);
                case 'removeSequence': return await this.handleRemoveSequence(session, node, edges, allNodes, contact, messageData);
                case 'resolveConversation': return await this.handleResolveConversation(session, node);
                case 'httpApi': return await this.handleHttpApi(session, node, edges, allNodes, contact, messageData);
                case 'detectCountry': return await this.handleDetectCountry(session, node, edges, allNodes, contact, messageData);
                case 'aiResponse': return await this.handleAiResponse(session, node, edges, allNodes, contact, messageData);
                case 'workingHours': return await this.handleWorkingHours(session, node, edges, allNodes, contact, messageData);
                case 'inputFlow': {
                    const inputType = node.data?.config?.inputType || 'TEXT';
                    if (inputType === 'NUMBER')
                        return await this.handleAskNumber(session, node, edges, allNodes, contact, messageData);
                    if (inputType === 'DATE')
                        return await this.handleAskDate(session, node, edges, allNodes, contact, messageData);
                    if (inputType === 'IMAGE')
                        return await this.handleAskImage(session, node, edges, allNodes, contact, messageData);
                    if (inputType === 'FILE')
                        return await this.handleAskFile(session, node, edges, allNodes, contact, messageData);
                    if (inputType === 'LOCATION')
                        return await this.handleAskLocation(session, node, edges, allNodes, contact, messageData);
                    return await this.handleAskText(session, node, edges, allNodes, contact, messageData);
                }
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
    async executeNodeActions(contact, node) {
        const nodeActions = node.data?.config?.nodeActions;
        if (!nodeActions)
            return;
        let updateData = {};
        let shouldUpdate = false;
        const currentTags = contact.tags || [];
        let newTags = [...currentTags];
        if (nodeActions.addTags?.length) {
            for (const tag of nodeActions.addTags) {
                if (!newTags.includes(tag))
                    newTags.push(tag);
            }
        }
        if (nodeActions.removeTags?.length) {
            newTags = newTags.filter(tag => !nodeActions.removeTags.includes(tag));
        }
        if (newTags.length !== currentTags.length || !newTags.every((val, index) => val === currentTags[index])) {
            updateData.tags = newTags;
            shouldUpdate = true;
        }
        if (nodeActions.assignTo && nodeActions.assignTo !== contact.agentId) {
            updateData.agentId = nodeActions.assignTo;
            shouldUpdate = true;
        }
        if (shouldUpdate) {
            try {
                await this.prisma.contact.update({
                    where: { id: contact.id },
                    data: updateData
                });
                if (updateData.tags)
                    contact.tags = updateData.tags;
                if (updateData.agentId)
                    contact.agentId = updateData.agentId;
                this.logger.debug(`Executed nodeActions for node ${node.id} on contact ${contact.id}`);
            }
            catch (err) {
                this.logger.error(`Failed to execute nodeActions on contact ${contact.id}: ${err.message}`);
            }
        }
    }
    async sendBotMessageAndTrack(session, contact, type, content, sendFn) {
        const message = await this.messagingService.createMessage({
            organizationId: session.organizationId,
            whatsappAccountId: session.accountId,
            contactId: contact.id,
            direction: 'OUTBOUND',
            type: type,
            content,
            metadata: { isChatbot: true, chatbotId: session.chatbotId },
            sentAt: new Date(),
        });
        try {
            const response = await sendFn();
            const waMessageId = response?.messages?.[0]?.id;
            if (waMessageId && message?.id) {
                const updatedMsg = await this.prisma.message.update({
                    where: { id: message.id },
                    data: { waMessageId }
                });
                this.messagingService.emitMessageStatus(session.organizationId, updatedMsg);
            }
            return response;
        }
        catch (err) {
            this.logger.error(`Failed to send bot message: ${err.message}`);
            throw err;
        }
    }
    async handleSendText(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        let text = await this.resolveVariables(config.text || '', session, contact, messageData);
        if (text) {
            const message = await this.messagingService.createMessage({
                organizationId: session.organizationId,
                whatsappAccountId: session.accountId,
                contactId: contact.id,
                direction: 'OUTBOUND',
                type: 'TEXT',
                content: { body: text },
                metadata: { isChatbot: true },
                sentAt: new Date(),
            });
            const response = await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, text);
            const waMessageId = response?.messages?.[0]?.id;
            if (waMessageId && message?.id) {
                await this.prisma.message.update({
                    where: { id: message.id },
                    data: { waMessageId }
                });
            }
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleSendData(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const dataType = config.dataType || 'TEXT';
        try {
            if (dataType === 'TEXT') {
                const text = await this.resolveVariables(config.text || '', session, contact, messageData);
                if (text) {
                    await this.sendBotMessageAndTrack(session, contact, 'TEXT', { body: text }, () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, text));
                }
            }
            else if (['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'].includes(dataType)) {
                let mediaUrl = config.mediaUrl;
                if (config.uploadMethod === 'VARIABLE' && config.mediaVariable) {
                    mediaUrl = await this.resolveVariables(config.mediaVariable, session, contact, messageData);
                }
                if (mediaUrl) {
                    let type = 'IMAGE';
                    if (dataType === 'VIDEO')
                        type = 'VIDEO';
                    if (dataType === 'AUDIO')
                        type = 'AUDIO';
                    if (dataType === 'DOCUMENT')
                        type = 'DOCUMENT';
                    await this.sendBotMessageAndTrack(session, contact, type, { link: mediaUrl }, async () => this.whatsappService.sendMediaByUrl(session.organizationId, session.accountId, contact.phone, type.toLowerCase(), mediaUrl, await this.resolveVariables(config.caption || '', session, contact, messageData), await this.resolveVariables(config.mediaFilename || '', session, contact, messageData)));
                }
            }
            else if (dataType === 'LOCATION') {
                const locationData = {
                    latitude: parseFloat(await this.resolveVariables(config.latitude || '0', session, contact, messageData)),
                    longitude: parseFloat(await this.resolveVariables(config.longitude || '0', session, contact, messageData)),
                    name: config.locationName ? await this.resolveVariables(config.locationName, session, contact, messageData) : undefined,
                    address: config.address ? await this.resolveVariables(config.address, session, contact, messageData) : undefined,
                };
                if (locationData.latitude && locationData.longitude) {
                    await this.sendBotMessageAndTrack(session, contact, 'LOCATION', locationData, () => this.whatsappService.sendLocationMessage(session.organizationId, session.accountId, contact.phone, locationData));
                }
            }
            else if (dataType === 'CONTACT') {
                const contactData = {
                    firstName: await this.resolveVariables(config.contactFirstName || '', session, contact, messageData),
                    lastName: await this.resolveVariables(config.contactLastName || '', session, contact, messageData),
                    phone: await this.resolveVariables(config.contactPhone || '', session, contact, messageData),
                    email: await this.resolveVariables(config.contactEmail || '', session, contact, messageData),
                    organization: await this.resolveVariables(config.contactOrg || '', session, contact, messageData),
                    website: await this.resolveVariables(config.contactWebsite || '', session, contact, messageData),
                };
                if (contactData.firstName && contactData.phone) {
                    await this.sendBotMessageAndTrack(session, contact, 'CONTACT', { contacts: [contactData] }, () => this.whatsappService.sendContactMessage(session.organizationId, session.accountId, contact.phone, [contactData]));
                }
            }
            else if (dataType === 'CAROUSEL') {
                const body = await this.resolveVariables(config.carouselBody || '', session, contact, messageData);
                const cards = [];
                if (config.cards?.length) {
                    for (const c of config.cards) {
                        const cardBody = c.bodyText ? await this.resolveVariables(c.bodyText, session, contact, messageData) : undefined;
                        let mediaUrl = c.mediaUrl;
                        if (c.mediaMethod === 'VARIABLE' && c.mediaVariable) {
                            mediaUrl = await this.resolveVariables(c.mediaVariable, session, contact, messageData);
                        }
                        const buttons = [{
                                type: config.carouselButtonType === 'URL' ? 'url' : 'reply',
                                label: await this.resolveVariables(c.buttonLabel || 'Action', session, contact, messageData),
                                url: config.carouselButtonType === 'URL' ? await this.resolveVariables(c.buttonValue || '', session, contact, messageData) : undefined,
                                id: config.carouselButtonType !== 'URL' ? c.buttonValue : undefined
                            }];
                        cards.push({ headerType: c.headerType?.toLowerCase() || 'image', headerUrl: mediaUrl, body: cardBody, buttons });
                    }
                    await this.sendBotMessageAndTrack(session, contact, 'INTERACTIVE', { body, cards }, () => this.whatsappService.sendCarouselMessage(session.organizationId, session.accountId, contact.phone, { body, cards }));
                }
            }
        }
        catch (err) {
            this.logger.error(`SendData error [${dataType}]: ${err.message}`, err.stack);
        }
        let totalDelayMs = 0;
        if (config.delayHours)
            totalDelayMs += config.delayHours * 60 * 60 * 1000;
        if (config.delayMinutes)
            totalDelayMs += config.delayMinutes * 60 * 1000;
        if (config.delaySeconds)
            totalDelayMs += config.delaySeconds * 1000;
        if (totalDelayMs > 0) {
            let outEdges = edges.filter(e => e.source === node.id);
            const specific = outEdges.filter(e => e.sourceHandle === 'output');
            outEdges = specific.length > 0 ? specific : outEdges.filter(e => !e.sourceHandle);
            if (outEdges.length > 0) {
                const nextNodeId = outEdges[0].target;
                await this.prisma.chatbotSession.update({
                    where: { id: session.id },
                    data: {
                        status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                        waitingForInput: false,
                        currentNodeId: node.id,
                        expiresAt: new Date(Date.now() + totalDelayMs)
                    },
                });
                await this.delayQueue.add('resume-after-delay', {
                    sessionId: session.id,
                    nextNodeId,
                    organizationId: session.organizationId,
                    accountId: session.accountId,
                    contactId: contact.id
                }, { delay: totalDelayMs });
            }
            else {
                await this.markCompleted(session.id);
            }
            return;
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleInteractive(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const intType = config.interactiveType || 'BUTTONS';
        const headerContent = config.headerContent ? await this.resolveVariables(config.headerContent, session, contact, messageData) : undefined;
        const bodyText = config.bodyText ? await this.resolveVariables(config.bodyText, session, contact, messageData) : '';
        const footerText = config.footerText ? await this.resolveVariables(config.footerText, session, contact, messageData) : undefined;
        let payload = null;
        if (intType === 'BUTTONS') {
            const buttons = await Promise.all((config.buttons || []).map(async (b) => ({
                type: 'reply',
                reply: { id: b.postbackId || b.id, title: await this.resolveVariables(b.text || '', session, contact, messageData) }
            })));
            payload = { type: 'button', body: { text: bodyText }, action: { buttons } };
            if (footerText)
                payload.footer = { text: footerText };
            if (config.headerType && config.headerType !== 'NONE') {
                payload.header = { type: config.headerType.toLowerCase() };
                payload.header[config.headerType.toLowerCase()] = { [config.headerType === 'TEXT' ? 'text' : 'link']: headerContent };
            }
        }
        else if (intType === 'LIST') {
            const buttonText = await this.resolveVariables(config.listButtonText || 'Menu', session, contact, messageData);
            const sections = [];
            const outEdges = edges.filter(e => e.source === node.id);
            for (const edge of outEdges) {
                const targetNode = allNodes.find(n => n.id === edge.target);
                if (targetNode && targetNode.type === 'listSection') {
                    const sectionTitle = await this.resolveVariables(targetNode.data?.config?.sectionTitle || 'Section', session, contact, messageData);
                    const rows = [];
                    const sectionOutEdges = edges.filter(e => e.source === targetNode.id);
                    for (const secEdge of sectionOutEdges) {
                        const rowNode = allNodes.find(n => n.id === secEdge.target);
                        if (rowNode && rowNode.type === 'listRow') {
                            const rConfig = rowNode.data?.config || {};
                            rows.push({
                                id: rConfig.rowId || rowNode.id,
                                title: await this.resolveVariables(rConfig.rowTitle || 'Row', session, contact, messageData),
                                description: rConfig.rowDescription ? await this.resolveVariables(rConfig.rowDescription, session, contact, messageData) : undefined
                            });
                        }
                    }
                    if (rows.length > 0) {
                        sections.push({ title: sectionTitle, rows: rows.slice(0, 10) });
                    }
                }
            }
            payload = { type: 'list', body: { text: bodyText }, action: { button: buttonText, sections: sections.slice(0, 10) } };
            if (footerText)
                payload.footer = { text: footerText };
            if (config.headerType === 'TEXT' && headerContent)
                payload.header = { type: 'text', text: headerContent };
        }
        else if (intType === 'CTA') {
            const b = (config.ctaButtons || [])[0];
            if (b) {
                const label = await this.resolveVariables(b.label || '', session, contact, messageData);
                const value = await this.resolveVariables(b.value || '', session, contact, messageData);
                let actionName = 'cta_url';
                let parameters = { display_text: label, url: value };
                if (b.type === 'COPY') {
                    actionName = 'copy_code';
                    parameters = { display_text: label, coupon_code: value };
                }
                else if (b.type === 'PHONE') {
                    actionName = 'cta_call';
                    parameters = { display_text: label, phone_number: value };
                }
                payload = {
                    type: actionName,
                    body: { text: bodyText },
                    action: { name: actionName, parameters }
                };
                if (footerText)
                    payload.footer = { text: footerText };
                if (config.headerType && config.headerType !== 'NONE') {
                    payload.header = { type: config.headerType.toLowerCase() };
                    payload.header[config.headerType.toLowerCase()] = { [config.headerType === 'TEXT' ? 'text' : 'link']: headerContent };
                }
            }
        }
        else if (intType === 'LOCATION') {
            payload = { type: 'location_request_message', body: { text: bodyText }, action: { name: 'send_location' } };
        }
        else if (intType === 'CATALOG') {
            if (config.catalogType === 'MULTI') {
                payload = { type: 'catalog_message', body: { text: bodyText }, action: { name: 'catalog_message', parameters: { thumbnail_product_retailer_id: config.productIds?.[0] } } };
            }
            else {
                payload = { type: 'product', body: { text: bodyText }, action: { catalog_id: config.catalogId, product_retailer_id: config.productIds?.[0] } };
            }
            if (footerText)
                payload.footer = { text: footerText };
        }
        if (payload) {
            try {
                await this.sendBotMessageAndTrack(session, contact, 'INTERACTIVE', { body: bodyText }, () => this.whatsappService.sendInteractiveMessage(session.organizationId, session.accountId, contact.phone, payload));
            }
            catch (err) {
                this.logger.error(`handleInteractive Error: ${err.message}`);
            }
        }
        if (intType === 'BUTTONS' || intType === 'LIST' || intType === 'LOCATION') {
            const waitingNodeType = intType === 'BUTTONS' ? 'button' : intType === 'LIST' ? 'list' : 'askLocation';
            await this.prisma.chatbotSession.update({
                where: { id: session.id },
                data: {
                    status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                    waitingForInput: true,
                    waitingNodeType: waitingNodeType,
                    currentNodeId: node.id,
                },
            });
            return;
        }
        const delayHours = config.delayHours || 0;
        const delayMinutes = config.delayMinutes || 0;
        const delaySeconds = config.delaySeconds || 0;
        const totalDelayMs = (delayHours * 3600 + delayMinutes * 60 + delaySeconds) * 1000;
        const outEdges = edges.filter(e => e.source === node.id);
        if (totalDelayMs > 0) {
            if (outEdges.length > 0) {
                await this.prisma.chatbotSession.update({
                    where: { id: session.id },
                    data: { status: client_1.ChatbotSessionStatus.WAITING_REPLY, waitingForInput: false, currentNodeId: node.id, expiresAt: new Date(Date.now() + totalDelayMs) },
                });
                await this.delayQueue.add('resume-after-delay', { sessionId: session.id, nextNodeId: outEdges[0].target, organizationId: session.organizationId, accountId: session.accountId, contactId: contact.id }, { delay: totalDelayMs });
            }
            else {
                await this.markCompleted(session.id);
            }
            return;
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleSendContact(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const contactData = {
            firstName: await this.resolveVariables(config.firstName || '', session, contact, messageData),
            lastName: await this.resolveVariables(config.lastName || '', session, contact, messageData),
            phone: await this.resolveVariables(config.phone || '', session, contact, messageData),
            email: await this.resolveVariables(config.email || '', session, contact, messageData),
            organization: await this.resolveVariables(config.organization || '', session, contact, messageData),
            website: await this.resolveVariables(config.website || '', session, contact, messageData),
        };
        if (contactData.firstName && contactData.phone) {
            try {
                await this.whatsappService.sendContactMessage(session.organizationId, session.accountId, contact.phone, [contactData]);
            }
            catch (err) {
                this.logger.error(`SendContact error: ${err.message}`);
            }
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleSendLocation(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const locationData = {
            latitude: parseFloat(await this.resolveVariables(config.latitude || '0', session, contact, messageData)),
            longitude: parseFloat(await this.resolveVariables(config.longitude || '0', session, contact, messageData)),
            name: config.name ? await this.resolveVariables(config.name, session, contact, messageData) : undefined,
            address: config.address ? await this.resolveVariables(config.address, session, contact, messageData) : undefined,
        };
        if (locationData.latitude && locationData.longitude) {
            try {
                await this.whatsappService.sendLocationMessage(session.organizationId, session.accountId, contact.phone, locationData);
            }
            catch (err) {
                this.logger.error(`SendLocation error: ${err.message}`);
            }
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'notSubmitted');
    }
    async handleSendCarousel(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const body = await this.resolveVariables(config.body || 'Check out these options:', session, contact, messageData);
        const cards = [];
        if (config.cards?.length) {
            for (const c of config.cards) {
                const cardBody = c.body ? await this.resolveVariables(c.body, session, contact, messageData) : undefined;
                const headerUrl = await this.resolveVariables(c.headerUrl || '', session, contact, messageData);
                const buttons = await Promise.all((c.buttons || []).map(async (b) => ({
                    ...b,
                    label: await this.resolveVariables(b.label || '', session, contact, messageData),
                    url: b.type === 'url' ? await this.resolveVariables(b.url || '', session, contact, messageData) : undefined
                })));
                cards.push({
                    headerType: c.headerType || 'image',
                    headerUrl,
                    body: cardBody,
                    buttons
                });
            }
            try {
                await this.whatsappService.sendCarouselMessage(session.organizationId, session.accountId, contact.phone, { body, cards });
                const hasQuickReply = config.cards.some((c) => (c.buttons || []).some((b) => b.type === 'reply'));
                if (hasQuickReply) {
                    await this.prisma.chatbotSession.update({
                        where: { id: session.id },
                        data: {
                            status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                            waitingForInput: true,
                            waitingNodeType: 'carousel',
                            currentNodeId: node.id,
                        },
                    });
                }
                else {
                    await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
                }
            }
            catch (err) {
                this.logger.error(`SendCarousel error: ${err.message}`);
                await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
            }
        }
        else {
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
        }
    }
    async handleSendCTAButton(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const body = await this.resolveVariables(config.body || 'Click the button below:', session, contact, messageData);
        const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
        const header = config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined;
        const buttonLabel = await this.resolveVariables(config.buttonLabel || 'Learn More', session, contact, messageData);
        const url = await this.resolveVariables(config.url || '', session, contact, messageData);
        if (url) {
            try {
                await this.whatsappService.sendCTAButtonMessage(session.organizationId, session.accountId, contact.phone, { body, footer, header, buttonLabel, url });
            }
            catch (err) {
                this.logger.error(`SendCTAButton error: ${err.message}`);
            }
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleSendFlow(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const body = await this.resolveVariables(config.body || 'Please complete the form:', session, contact, messageData);
        const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
        const flowCta = await this.resolveVariables(config.flowCta || 'Open Form', session, contact, messageData);
        const flowToken = (0, uuid_1.v4)();
        if (config.flowId) {
            try {
                await this.whatsappService.sendFlowMessage(session.organizationId, session.accountId, contact.phone, {
                    body,
                    footer,
                    flowId: config.flowId,
                    flowToken,
                    flowCta,
                    flowMode: config.flowMode,
                    screen: config.screen,
                    payload: config.payload
                });
                await this.prisma.chatbotSession.update({
                    where: { id: session.id },
                    data: {
                        status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                        waitingForInput: true,
                        waitingNodeType: 'flow',
                        currentNodeId: node.id,
                        metadata: {
                            ...session.metadata || {},
                            lastFlowToken: flowToken,
                            flowId: config.flowId
                        }
                    },
                });
            }
            catch (err) {
                this.logger.error(`SendFlow error: ${err.message}`);
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'notSubmitted');
            }
        }
        else {
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'notSubmitted');
        }
    }
    async handleSendCallRequest(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const body = await this.resolveVariables(config.body || 'We would like to call you to help with your query.', session, contact, messageData);
        const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
        try {
            await this.whatsappService.sendCallRequestMessage(session.organizationId, session.accountId, contact.phone, { body, footer });
            await this.prisma.chatbotSession.update({
                where: { id: session.id },
                data: {
                    status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                    waitingForInput: true,
                    waitingNodeType: 'callRequest',
                    currentNodeId: node.id,
                },
            });
        }
        catch (err) {
            this.logger.error(`SendCallRequest error: ${err.message}`);
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
        }
    }
    async handleAskText(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || 'Please enter your text:', session, contact, messageData);
        if (question) {
            await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askText',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskNumber(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || 'Please enter a number:', session, contact, messageData);
        if (question) {
            await this.sendBotMessageAndTrack(session, contact, 'TEXT', { body: question }, () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question));
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askNumber',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskDate(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || 'Please enter a date:', session, contact, messageData);
        if (question) {
            await this.sendBotMessageAndTrack(session, contact, 'TEXT', { body: question }, () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question));
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askDate',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskEmail(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || 'Please enter your email address:', session, contact, messageData);
        if (question) {
            await this.sendBotMessageAndTrack(session, contact, 'TEXT', { body: question }, () => this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question));
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askEmail',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskLocation(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || 'Please share your location:', session, contact, messageData);
        if (question) {
            await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        }
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askLocation',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskAddress(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const bodyText = await this.resolveVariables(config.question || config.text || 'Please provide your address:', session, contact, messageData);
        await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, bodyText);
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askAddress',
                currentNodeId: node.id,
            },
        });
    }
    async handleAskImage(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || config.text || 'Please upload an image:', session, contact, messageData);
        await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askImage',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskVideo(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || config.text || 'Please upload a video:', session, contact, messageData);
        await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askVideo',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskAudio(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || config.text || 'Please send your voice message:', session, contact, messageData);
        await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askAudio',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
    }
    async handleAskFile(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const question = await this.resolveVariables(config.question || config.text || 'Please upload the requested file:', session, contact, messageData);
        await this.whatsappService.sendTextMessage(session.organizationId, session.accountId, contact.phone, question);
        await this.prisma.chatbotSession.update({
            where: { id: session.id },
            data: {
                status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                waitingForInput: true,
                waitingNodeType: 'askFile',
                currentNodeId: node.id,
                metadata: {
                    ...session.metadata || {},
                    currentAttempt: 0
                }
            },
        });
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
            id: b.postbackId || b.id || b.payload || b.title,
            title: b.title || b.label,
        }));
        if (buttons.length > 0) {
            await this.sendBotMessageAndTrack(session, contact, 'INTERACTIVE', { body: bodyText, buttons }, () => this.whatsappService.sendInteractiveButtons(session.organizationId, session.accountId, contact.phone, bodyText, buttons, headerText, footerText));
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
            await this.sendBotMessageAndTrack(session, contact, 'INTERACTIVE', { body: bodyText, sections }, () => this.whatsappService.sendInteractiveList(session.organizationId, session.accountId, contact.phone, bodyText, buttonText, sections, headerText, footerText));
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
    async handleSendListAdvanced(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const bodyText = await this.resolveVariables(config.body || 'Please select an option:', session, contact, messageData);
        const buttonText = config.buttonText || 'View Options';
        const sectionTitle = config.sectionTitle || 'Options';
        try {
            const url = await this.resolveVariables(config.apiUrl || '', session, contact, messageData);
            const method = config.method || 'GET';
            const headers = { 'Content-Type': 'application/json' };
            (config.headers || []).forEach((h) => { headers[h.key] = h.value; });
            const response = await (0, axios_1.default)({
                method,
                url,
                headers,
                data: method !== 'GET' ? config.bodyData : undefined,
                params: config.params
            });
            const data = response.data;
            const itemsPath = config.itemsPath || '';
            const items = itemsPath ? this.getValueByPath(data, itemsPath) : data;
            if (!Array.isArray(items)) {
                this.logger.warn(`SendListAdvanced: Items at path "${itemsPath}" is not an array.`);
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
            }
            const rows = items.slice(0, 10).map((item) => ({
                id: String(this.getValueByPath(item, config.optionIdPath || 'id') || (0, uuid_1.v4)()),
                title: String(this.getValueByPath(item, config.optionTitlePath || 'name') || 'Option').substring(0, 24),
                description: config.optionDescPath ? String(this.getValueByPath(item, config.optionDescPath) || '').substring(0, 72) : undefined
            }));
            if (rows.length > 0) {
                await this.whatsappService.sendInteractiveList(session.organizationId, session.accountId, contact.phone, bodyText, buttonText, [{ title: sectionTitle, rows }], config.header, config.footer);
            }
            await this.prisma.chatbotSession.update({
                where: { id: session.id },
                data: {
                    status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                    waitingForInput: true,
                    waitingNodeType: 'listAdvanced',
                    currentNodeId: node.id,
                    metadata: { ...session.metadata || {}, lastAdvancedListItems: items }
                },
            });
        }
        catch (err) {
            this.logger.error(`SendListAdvanced API error: ${err.message}`);
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
        }
    }
    getValueByPath(obj, path) {
        if (!path)
            return obj;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
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
        if (config.headerParams?.length) {
            const params = await Promise.all(config.headerParams.map(async (p) => {
                const type = p.type || 'text';
                if (type === 'text') {
                    return { type: 'text', text: await this.resolveVariables(p.text || '', session, contact, messageData) };
                }
                else if (['image', 'video', 'document'].includes(type)) {
                    return {
                        type: type,
                        [type]: {
                            link: await this.resolveVariables(p.link || '', session, contact, messageData),
                        },
                    };
                }
                return null;
            }));
            const filtered = params.filter(Boolean);
            if (filtered.length) {
                components.push({ type: 'header', parameters: filtered });
            }
        }
        if (config.bodyParams?.length) {
            const params = await Promise.all(config.bodyParams.map(async (p) => ({
                type: 'text',
                text: await this.resolveVariables(p, session, contact, messageData),
            })));
            components.push({ type: 'body', parameters: params });
        }
        if (config.buttons?.length) {
            config.buttons.forEach(async (btn, index) => {
                if (btn.type === 'url' && btn.dynamic) {
                    components.push({
                        type: 'button',
                        sub_type: 'url',
                        index: String(index),
                        parameters: [
                            {
                                type: 'text',
                                text: await this.resolveVariables(btn.suffix || '', session, contact, messageData),
                            },
                        ],
                    });
                }
            });
        }
        await this.sendBotMessageAndTrack(session, contact, 'TEMPLATE', { templateName: config.templateName, name: config.templateName, language: config.language || 'en_US', components }, () => this.whatsappService.sendTemplateMessage(session.organizationId, session.accountId, contact.phone, config.templateName, config.language || 'en_US', components));
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleSendPayment(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const rawAmount = config.amountType === 'field'
            ? await this.resolveVariables(config.amountField || '', session, contact, messageData)
            : config.amountValue;
        const amount = parseFloat(rawAmount || '0');
        let referenceId = '';
        if (config.referenceType === 'field') {
            referenceId = await this.resolveVariables(config.referenceField || '', session, contact, messageData);
        }
        else {
            referenceId = `TX_${Date.now()}_${(0, uuid_1.v4)().substring(0, 6)}`;
        }
        const body = await this.resolveVariables(config.body || 'Please complete your payment to proceed.', session, contact, messageData);
        const footer = config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined;
        const razorpayReceipt = config.razorpayReceipt ? await this.resolveVariables(config.razorpayReceipt, session, contact, messageData) : undefined;
        let razorpayNotes = {};
        if (config.razorpayNotes) {
            try {
                const resolvedNotes = await this.resolveVariables(config.razorpayNotes, session, contact, messageData);
                razorpayNotes = JSON.parse(resolvedNotes);
            }
            catch (e) {
                this.logger.warn(`Failed to parse Razorpay notes for node ${node.id}`);
            }
        }
        try {
            await this.whatsappService.sendPaymentMessage(session.organizationId, session.accountId, contact.phone, {
                body,
                footer,
                referenceId,
                amount,
                currency: config.currency || 'INR',
                gateway: config.gateway || 'razorpay',
                configId: config.configId,
                razorpayReceipt,
                razorpayNotes
            });
            await this.prisma.chatbotSession.update({
                where: { id: session.id },
                data: {
                    status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                    waitingForInput: true,
                    waitingNodeType: 'payment',
                    currentNodeId: node.id,
                    metadata: {
                        ...session.metadata || {},
                        lastPaymentReference: referenceId,
                        paymentAmount: amount
                    }
                },
            });
            const expiryMinutes = parseInt(config.expiryValue || '30', 10);
            const delayMs = expiryMinutes * 60 * 1000;
            await this.delayQueue.add('payment-expiry', { sessionId: session.id, nextNodeId: node.id, type: 'payment_expiry' }, { delay: delayMs });
        }
        catch (err) {
            this.logger.error(`SendPayment error: ${err.message}`);
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'expired');
        }
    }
    async handleProductSearch(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const query = config.searchTextVar
            ? await this.resolveVariables(config.searchTextVar, session, contact, messageData)
            : '';
        if (!query || !config.catalogId) {
            this.logger.warn(`ProductSearch node ${node.id} missing query or catalogId`);
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'noResults');
        }
        try {
            const products = await this.whatsappService.searchCatalogProducts(session.organizationId, session.accountId, config.catalogId, query, config.searchFields || ['name']);
            if (!products || products.length === 0) {
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'noResults');
            }
            const sections = [];
            const MAX_TOTAL_PRODUCTS = 30;
            const grouped = {};
            let totalCount = 0;
            for (const p of products) {
                if (totalCount >= MAX_TOTAL_PRODUCTS)
                    break;
                const category = p.category || 'Results';
                if (!grouped[category])
                    grouped[category] = [];
                grouped[category].push(p.retailer_id);
                totalCount++;
            }
            for (const [title, pids] of Object.entries(grouped)) {
                sections.push({ title, products: pids });
            }
            await this.whatsappService.sendProductListMessage(session.organizationId, session.accountId, contact.phone, {
                catalogId: config.catalogId,
                body: await this.resolveVariables(config.body || `I found some products matching "${query}":`, session, contact, messageData),
                header: config.header ? await this.resolveVariables(config.header, session, contact, messageData) : undefined,
                footer: config.footer ? await this.resolveVariables(config.footer, session, contact, messageData) : undefined,
                sections: sections.slice(0, 10)
            });
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
        }
        catch (err) {
            this.logger.error(`ProductSearch error: ${err.message}`);
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'noResults');
        }
    }
    async handleProductCategorization(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        if (!config.catalogId) {
            this.logger.warn(`ProductCategorization node ${node.id} missing catalogId`);
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
        }
        try {
            const products = await this.whatsappService.searchCatalogProducts(session.organizationId, session.accountId, config.catalogId, '', ['name']);
            const method = config.categorizationMethod || 'product_category';
            const aggregation = {};
            products.forEach((p) => {
                let value = 'Others';
                if (method === 'brand')
                    value = p.brand || 'No Brand';
                else if (method === 'product_category')
                    value = p.category || 'Uncategorized';
                else if (method === 'material')
                    value = p.material || 'Standard';
                else if (method === 'pattern')
                    value = p.pattern || 'Plain';
                aggregation[value] = (aggregation[value] || 0) + 1;
            });
            const rows = Object.entries(aggregation).map(([label, count]) => ({
                id: `cat_${label}`,
                title: `${label} (${count})`,
                description: `View items in ${label}`
            })).slice(0, 10);
            const sections = [{
                    title: 'Categories',
                    rows
                }];
            const body = await this.resolveVariables(config.body || 'Select a category to browse:', session, contact, messageData);
            const footer = config.footer || 'Tap to view Categories details view items';
            await this.whatsappService.sendInteractiveList(session.organizationId, session.accountId, contact.phone, body, 'View Categories', sections, config.header, footer);
            await this.prisma.chatbotSession.update({
                where: { id: session.id },
                data: {
                    status: client_1.ChatbotSessionStatus.WAITING_REPLY,
                    waitingForInput: true,
                    waitingNodeType: 'product_categorization',
                    currentNodeId: node.id,
                },
            });
        }
        catch (err) {
            this.logger.error(`ProductCategorization error: ${err.message}`);
            await this.advanceFromNode(session, node, edges, allNodes, contact, messageData);
        }
    }
    async handleDelay(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const amount = parseInt(config.value || config.delayAmount || config.amount || '5', 10);
        const unitStr = (config.unit || config.delayUnit || 'seconds').toLowerCase();
        const unitMs = {
            seconds: 1000,
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
        };
        const delayMs = amount * (unitMs[unitStr] || 1000);
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
                currentNodeId: node.id,
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
        const fieldToUpdate = config.fieldName;
        const valueSource = config.valueSource || 'free_text';
        let valueToSet = '';
        if (valueSource === 'free_text') {
            valueToSet = await this.resolveVariables(config.fieldValue || '', session, contact, messageData);
        }
        else if (valueSource === 'last_message') {
            valueToSet = messageData?.body || '';
        }
        else if (valueSource === 'custom_field') {
            const sourceField = config.sourceField;
            if (sourceField) {
                const customFields = contact.customFields || {};
                valueToSet = customFields[sourceField] || '';
            }
        }
        if (fieldToUpdate) {
            const currentFields = contact.customFields || {};
            await this.prisma.contact.update({
                where: { id: contact.id },
                data: { customFields: { ...currentFields, [fieldToUpdate]: valueToSet } },
            });
            this.logger.log(`Updated contact ${contact.phone} field ${fieldToUpdate} to "${valueToSet}" via ${valueSource}.`);
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
    async handleUpdateSubscription(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const status = config.status || 'ACTIVE';
        const updateData = { status };
        if (status === 'ACTIVE') {
            updateData.optedInAt = new Date();
        }
        else if (status === 'UNSUBSCRIBED') {
            updateData.optedOutAt = new Date();
        }
        await this.prisma.contact.update({
            where: { id: contact.id },
            data: updateData
        });
        this.logger.log(`Updated contact ${contact.phone} subscription status to ${status}.`);
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleAssignTeam(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const mode = config.assignmentMode || 'direct';
        let agentId = config.agentId;
        if (mode === 'round-robin') {
            const users = await this.prisma.user.findMany({
                where: { organizationId: session.organizationId },
                orderBy: { id: 'asc' }
            });
            if (users.length > 0) {
                const lastContact = await this.prisma.contact.findFirst({
                    where: { organizationId: session.organizationId, agentId: { not: null } },
                    orderBy: { updatedAt: 'desc' }
                });
                if (lastContact && lastContact.agentId) {
                    const lastIndex = users.findIndex(u => u.id === lastContact.agentId);
                    const nextIndex = (lastIndex + 1) % users.length;
                    agentId = users[nextIndex].id;
                }
                else {
                    agentId = users[0].id;
                }
            }
        }
        if (agentId) {
            await this.prisma.contact.update({
                where: { id: contact.id },
                data: { agentId }
            });
            this.logger.log(`Assigned contact ${contact.phone} to agent ${agentId} via ${mode} mode.`);
        }
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleAssignSequence(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        this.logger.log(`Assigning contact ${contact.phone} to sequence ${config.sequenceId} (Org: ${session.organizationId})`);
        await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleRemoveSequence(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        this.logger.log(`Removing contact ${contact.phone} from sequence ${config.sequenceId} (Org: ${session.organizationId})`);
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
    async handleWorkingHours(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const timezone = config.timezone || 'UTC';
        const schedule = config.schedule || {};
        const holidays = config.holidays || [];
        try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                weekday: 'long',
            });
            const parts = formatter.formatToParts(now);
            const getPart = (type) => parts.find(p => p.type === type)?.value;
            const weekday = getPart('weekday')?.toLowerCase();
            const dateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
            const timeStr = `${getPart('hour')}:${getPart('minute')}`;
            if (holidays.includes(dateStr)) {
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
            }
            if (!weekday)
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
            const dayConfig = schedule[weekday];
            if (!dayConfig || !dayConfig.enabled) {
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
            }
            const { open, close, breakStart, breakEnd } = dayConfig;
            const isWithinHours = timeStr >= (open || '00:00') && timeStr <= (close || '23:59');
            if (!isWithinHours) {
                return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
            }
            if (breakStart && breakEnd) {
                const isWithinBreak = timeStr >= breakStart && timeStr <= breakEnd;
                if (isWithinBreak) {
                    return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'closed');
                }
            }
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'open');
        }
        catch (err) {
            this.logger.error(`WorkingHours node error: ${err.message}`);
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, config.fallback || 'closed');
        }
    }
    async handleDetectCountry(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const source = config.phoneSource || 'contact.phone';
        const saveCodeTo = config.saveCountryCodeTo;
        const saveNameTo = config.saveCountryNameTo;
        const alsoSaveName = config.alsoSaveCountryName;
        let phoneNumberStr = '';
        if (source === 'contact.phone') {
            phoneNumberStr = contact.phone;
        }
        else if (source.startsWith('custom.')) {
            const field = source.replace('custom.', '');
            phoneNumberStr = contact.customFields?.[field] || '';
        }
        else if (source.startsWith('var.')) {
            const name = source.replace('var.', '');
            phoneNumberStr = session.variables?.[name] || '';
        }
        try {
            if (!phoneNumberStr.startsWith('+')) {
                phoneNumberStr = '+' + phoneNumberStr;
            }
            const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(phoneNumberStr);
            if (phoneNumber && phoneNumber.country) {
                const countryCode = phoneNumber.country;
                const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
                const updates = {};
                const variables = { ...session.variables || {} };
                if (saveCodeTo) {
                    if (saveCodeTo.startsWith('custom.')) {
                        const field = saveCodeTo.replace('custom.', '');
                        updates.customFields = { ...contact.customFields || {}, [field]: countryCode };
                    }
                    else {
                        const name = saveCodeTo.startsWith('var.') ? saveCodeTo.replace('var.', '') : saveCodeTo;
                        variables[name] = countryCode;
                    }
                }
                if (alsoSaveName && saveNameTo) {
                    if (saveNameTo.startsWith('custom.')) {
                        const field = saveNameTo.replace('custom.', '');
                        updates.customFields = { ...(updates.customFields || contact.customFields || {}), [field]: countryName };
                    }
                    else {
                        const name = saveNameTo.startsWith('var.') ? saveNameTo.replace('var.', '') : saveNameTo;
                        variables[name] = countryName;
                    }
                }
                if (Object.keys(updates).length > 0) {
                    await this.prisma.contact.update({ where: { id: contact.id }, data: updates });
                }
                await this.prisma.chatbotSession.update({
                    where: { id: session.id },
                    data: { variables }
                });
                session.variables = variables;
            }
        }
        catch (err) {
            this.logger.error(`DetectCountry error: ${err.message}`);
        }
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
    }
    async handleAiResponse(session, node, edges, allNodes, contact, messageData) {
        const config = node.data?.config || {};
        const systemPrompt = await this.resolveVariables(config.systemPrompt || 'You are a helpful assistant.', session, contact, messageData);
        const includeHistory = config.includeHistory !== false;
        const saveTo = config.saveToField || 'ai_response';
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            this.logger.error('OPENAI_API_KEY is not configured in .env');
            return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
        }
        try {
            const messages = [{ role: 'system', content: systemPrompt }];
            if (includeHistory) {
                const conversation = await this.prisma.conversation.findFirst({
                    where: { contactId: contact.id, whatsappAccountId: session.accountId }
                });
                if (conversation) {
                    const history = await this.prisma.message.findMany({
                        where: { conversationId: conversation.id },
                        orderBy: { createdAt: 'desc' },
                        take: 10
                    });
                    history.reverse().forEach(msg => {
                        if (msg.type === 'TEXT' && msg.content?.body) {
                            messages.push({
                                role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
                                content: msg.content.body
                            });
                        }
                    });
                }
            }
            const currentText = messageData.text?.body || '';
            if (currentText) {
                if (messages[messages.length - 1]?.content !== currentText) {
                    messages.push({ role: 'user', content: currentText });
                }
            }
            const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages,
                max_tokens: 1000
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            const aiText = response.data.choices[0].message.content;
            const variables = { ...session.variables || {} };
            const updates = {};
            if (saveTo.startsWith('custom.')) {
                const field = saveTo.replace('custom.', '');
                updates.customFields = { ...contact.customFields || {}, [field]: aiText };
            }
            else {
                const name = saveTo.startsWith('var.') ? saveTo.replace('var.', '') : saveTo;
                variables[name] = aiText;
            }
            if (Object.keys(updates).length > 0) {
                await this.prisma.contact.update({ where: { id: contact.id }, data: updates });
            }
            await this.prisma.chatbotSession.update({
                where: { id: session.id },
                data: { variables }
            });
            session.variables = variables;
        }
        catch (err) {
            this.logger.error(`AI Response error: ${err.response?.data?.error?.message || err.message}`);
        }
        return await this.advanceFromNode(session, node, edges, allNodes, contact, messageData, 'output');
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
    __param(5, (0, bull_1.InjectQueue)('flow-delays')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService,
        messaging_service_1.MessagingService,
        whatsapp_flows_service_1.WhatsAppFlowsService,
        realtime_gateway_1.RealtimeGateway,
        bullmq_1.Queue])
], FlowExecutorService);
//# sourceMappingURL=flow-executor.service.js.map