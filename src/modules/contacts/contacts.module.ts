import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { ImportProcessor } from './import.processor';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';


@Module({
  imports: [
    BullModule.registerQueue({
      name: 'contact-import',
    }),
    PrismaModule,
    RealtimeModule,
  ],

  controllers: [ContactsController, CustomFieldsController],
  providers: [ContactsService, ImportProcessor, CustomFieldsService],
  exports: [ContactsService],
})
export class ContactsModule {}
