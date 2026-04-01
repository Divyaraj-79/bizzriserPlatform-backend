"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const whatsapp_service_1 = require("./src/modules/whatsapp/whatsapp.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
async function testWabaFlow() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const whatsappService = app.get(whatsapp_service_1.WhatsappService);
    const prisma = app.get(prisma_service_1.PrismaService);
    console.log('--- STARTING WABA SIMULATION TEST ---');
    const org = await prisma.organization.findFirst();
    if (!org) {
        console.error('No organization found to test with.');
        await app.close();
        return;
    }
    console.log(`Using Org: ${org.name} (${org.id})`);
    const mockPayload = {
        wabaId: '3293889524125908',
        phoneNumberId: '532431136620877',
        code: 'MOCK_CODE_123'
    };
    try {
        console.log('Calling connectAccount with mock v4 payload...');
        await whatsappService.connectAccount(org.id, mockPayload);
        const account = await prisma.whatsAppAccount.findUnique({
            where: { phoneNumberId: mockPayload.phoneNumberId }
        });
        if (account && account.wabaId === mockPayload.wabaId) {
            console.log('SUCCESS: WhatsApp Account linked correctly in DB!');
            console.log('Account Details:', {
                displayName: account.displayName,
                phoneNumber: account.phoneNumber,
                status: account.status
            });
        }
        else {
            console.error('FAILURE: Account not found or ID mismatch in DB.');
        }
    }
    catch (err) {
        console.error('FLOW ERRORED:', err.message);
    }
    await app.close();
}
testWabaFlow();
//# sourceMappingURL=test_waba_flow.js.map