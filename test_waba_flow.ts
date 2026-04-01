import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { WhatsappService } from './src/modules/whatsapp/whatsapp.service';
import { PrismaService } from './src/prisma/prisma.service';

async function testWabaFlow() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const whatsappService = app.get(WhatsappService);
  const prisma = app.get(PrismaService);

  console.log('--- STARTING WABA SIMULATION TEST ---');

  // 1. Get a test organization
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found to test with.');
    await app.close();
    return;
  }

  console.log(`Using Org: ${org.name} (${org.id})`);

  // 2. Simulate the new "Proper Method" payload from the frontend
  const mockPayload = {
    wabaId: '3293889524125908', // Your WABA ID from logs
    phoneNumberId: '532431136620877', // Your Phone ID from logs
    code: 'MOCK_CODE_123'
  };

  try {
    console.log('Calling connectAccount with mock v4 payload...');
    // We expect the token exchange to fail (due to mock code), 
    // but the WABA discovery should now be 'Instant' because we provide the IDs.
    await whatsappService.connectAccount(org.id, mockPayload);
    
    // 3. Verify the record in DB
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
    } else {
      console.error('FAILURE: Account not found or ID mismatch in DB.');
    }
  } catch (err: any) {
    console.error('FLOW ERRORED:', err.message);
  }

  await app.close();
}

testWabaFlow();
