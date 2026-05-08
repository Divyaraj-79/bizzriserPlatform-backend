"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function main() {
    const directUrl = 'postgresql://neondb_owner:npg_IPmpMxe36VNn@ep-little-snow-a18ngv0q.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    const prisma = new client_1.PrismaClient({
        datasources: {
            db: {
                url: directUrl,
            },
        },
    });
    try {
        console.log('Attempting to connect to the database via DIRECT URL...');
        await prisma.$connect();
        console.log('Successfully connected!');
        const result = await prisma.$queryRaw `SELECT 1 as result`;
        console.log('Query result:', result);
    }
    catch (error) {
        console.error('Connection failed:');
        console.error(error);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=scratch_direct_test.js.map