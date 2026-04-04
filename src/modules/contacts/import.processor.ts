import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { ContactsService } from './contacts.service';

@Processor('contact-import')
export class ImportProcessor implements OnModuleInit {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private readonly contactsService: ContactsService) {}

  onModuleInit() {
    this.logger.log('Import Processor initialized and listening for jobs on "contact-import" queue.');
  }

  @Process('import-contacts')
  async handleImport(job: Job<{ orgId: string; contacts: any[] }>) {
    const { orgId, contacts } = job.data;
    const total = contacts.length;
    
    this.logger.log(`Starting background import for ${total} contacts (Org: ${orgId})`);
    
    try {
      // Phase 1: Signal start
      await job.updateProgress(1); // Small progress to signal it's picked up
      
      // Phase 2: Processing in batches with progress updates
      // Using a single transaction to ensure "all or nothing" as requested
      await this.contactsService.atomicBulkImport(orgId, contacts, async (progress) => {
         // Scale progress from 5% to 95%
         const scaledProgress = 5 + Math.floor(progress * 0.9);
         await job.updateProgress(scaledProgress);
      });

      await job.updateProgress(100);
      this.logger.log(`Import completed successfully for Org: ${orgId}`);
      return { success: true, count: total };
    } catch (err) {
      this.logger.error(`Import failed for Org: ${orgId}: ${err.message}`);
      throw err; // BullMQ will mark this job as failed
    }
  }
}
