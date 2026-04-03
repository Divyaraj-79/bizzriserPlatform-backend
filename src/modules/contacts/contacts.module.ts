import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { ImportProcessor } from './import.processor';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'contact-import',
    }),
    PrismaModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService, ImportProcessor],
  exports: [ContactsService],
})
export class ContactsModule {}
