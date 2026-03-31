"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const lastEvents = await prisma.webhookEvent.findMany({
        take: 10,
        orderBy: {
            createdAt: 'desc',
        },
    });
    console.log('Last 10 Webhook Events:', JSON.stringify(lastEvents, null, 2));
    const count = await prisma.webhookEvent.count();
    console.log(`Total Webhook Events: ${count}`);
    process.exit(0);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=check_webhooks.js.map