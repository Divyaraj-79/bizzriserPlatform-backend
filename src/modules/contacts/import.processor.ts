import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { ContactsService } from './contacts.service';
import { Logger } from '@nestjs/common';

@Processor('contact-import')
export class ImportProcessor {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private readonly contactsService: ContactsService) {}

  @Process('import-contacts')
  async handleImport(job: Job<{ orgId: string; contacts: any[] }>) {
    const { orgId, contacts } = job.data;
    const total = contacts.length;
    
    this.logger.log(`Starting background import for ${total} contacts (Org: ${orgId})`);
    
    try {
      // Phase 1: Validation & Deduplication (Initial)
      await job.progress(10);
      
      // Phase 2: Processing in batches with progress updates
      // Using a transaction to ensure "all or nothing" as requested
      await this.contactsService.atomicBulkImport(orgId, contacts, async (progress) => {
         // Scale progress from 10% to 90%
         const scaledProgress = 10 + Math.floor(progress * 0.8);
         await job.progress(scaledProgress);
      });

      await job.progress(100);
      this.logger.log(`Import completed successfully for Org: ${orgId}`);
      return { success: true, count: total };
    } catch (err) {
      this.logger.error(`Import failed for Org: ${orgId}: ${err.message}`);
      throw err; // BullMQ will mark this job as failed
    }
  }
}
