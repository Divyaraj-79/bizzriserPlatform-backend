"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const webhook_controller_1 = require("./webhook.controller");
const webhook_service_1 = require("./webhook.service");
const webhook_processor_1 = require("./webhook.processor");
const contacts_module_1 = require("../contacts/contacts.module");
const messaging_module_1 = require("../messaging/messaging.module");
const chatbots_module_1 = require("../chatbots/chatbots.module");
let WebhookModule = class WebhookModule {
};
exports.WebhookModule = WebhookModule;
exports.WebhookModule = WebhookModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.registerQueue({
                name: 'webhooks',
            }),
            contacts_module_1.ContactsModule,
            messaging_module_1.MessagingModule,
            chatbots_module_1.ChatbotsModule,
        ],
        controllers: [webhook_controller_1.WebhookController],
        providers: [webhook_service_1.WebhookService, webhook_processor_1.WebhookProcessor],
        exports: [webhook_service_1.WebhookService],
    })
], WebhookModule);
//# sourceMappingURL=webhook.module.js.map