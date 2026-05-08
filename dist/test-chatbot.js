"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const webhook_processor_1 = require("./src/modules/webhook/webhook.processor");
const prisma_service_1 = require("./src/prisma/prisma.service");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const webhookProcessor = app.get(webhook_processor_1.WebhookProcessor);
    const prisma = app.get(prisma_service_1.PrismaService);
    const activeBots = await prisma.chatbot.findMany({ where: { status: 'ACTIVE' } });
    if (activeBots.length === 0) {
        console.log('No active chatbots found in DB. Please enable one first.');
        await app.close();
        return;
    }
    const bot = activeBots[0];
    console.log(`Testing with Chatbot: ${bot.id} - ${bot.name}`);
    const whatsappAccount = await prisma.whatsAppAccount.findFirst({ where: { organizationId: bot.organizationId } });
    const realAccountId = whatsappAccount ? whatsappAccount.id : bot.accountId;
    const testContact = await prisma.contact.findFirst({ where: { organizationId: bot.organizationId } });
    const fromPhone = testContact ? testContact.phone : '1234567890';
    const jobMock = {
        data: {
            eventId: 'test-event-1',
            accountId: realAccountId,
            organizationId: bot.organizationId,
            data: {
                contacts: [{ profile: { name: 'Test User' }, wa_id: fromPhone }],
                messages: [{
                        id: `wamid.test.${Date.now()}`,
                        from: fromPhone,
                        timestamp: Math.floor(Date.now() / 1000).toString(),
                        type: 'text',
                        text: { body: 'Hello' }
                    }]
            }
        }
    };
    console.log('Triggering handleIncomingMessage...');
    try {
        const contactData = jobMock.data.data.contacts[0];
        const messageData = jobMock.data.data.messages[0];
        await webhookProcessor.handleIncomingMessage(jobMock.data.accountId, jobMock.data.organizationId, contactData, messageData);
        console.log('Successfully processed message!');
    }
    catch (err) {
        console.error('Error processing message:', err);
    }
    await app.close();
}
bootstrap();
//# sourceMappingURL=test-chatbot.js.map