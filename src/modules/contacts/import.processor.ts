import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull'; // Use 'bull' to match @nestjs/bull decorators
import { ContactsService } from './contacts.service';

@Processor('contact-import')
export class ImportProcessor implements OnModuleInit {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(private readonly contactsService: ContactsService) {}

  onModuleInit() {
    this.logger.log('🚀 Bulk Import Processor successfully initialized and connected to Redis.');
  }

  @Process('import-contacts')
  async handleImport(job: any) {
    const { orgId, contacts } = job.data;
    const total = contacts.length;
    
    this.logger.log(`📥 Starting background import for ${total} contacts (Org: ${orgId}, Job ID: ${job.id})`);
    
    try {
      // Phase 1: Small progress to signal it's picked up by worker
      await job.progress(1);
      
      // Phase 2: Processing in batches with progress updates
      await this.contactsService.atomicBulkImport(orgId, contacts, async (p) => {
         // Scale progress from 5% to 95%
         const scaledProgress = 5 + Math.floor(p * 0.9);
         await job.progress(scaledProgress);
      });

      await job.progress(100);
      this.logger.log(`✅ Import completed successfully for Org: ${orgId}`);
      return { success: true, count: total };
    } catch (err) {
      this.logger.error(`❌ Import failed for Org: ${orgId}: ${err.message}`);
      throw err; 
    }
  }
}
