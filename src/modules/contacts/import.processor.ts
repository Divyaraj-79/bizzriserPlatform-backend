import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { ContactsService } from './contacts.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Processor('contact-import')

export class ImportProcessor implements OnModuleInit {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    private readonly contactsService: ContactsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 Bulk Import Processor successfully initialized and connected to Redis.');
  }

  @Process('import-contacts')
  async handleImport(job: any) {
    const { orgId, contacts } = job.data;
    const total = contacts.length;
    const jobId = job.id;
    
    this.logger.log(`📥 Starting background import for ${total} contacts (Org: ${orgId}, Job ID: ${jobId})`);
    
    try {
      const setProgress = async (val: any) => {
        // Update BullMQ Job Progress
        if (typeof job.updateProgress === 'function') await job.updateProgress(val);
        else if (typeof job.progress === 'function') await job.progress(val);

        // Emit Socket Event for Instant UI Update
        const stats = typeof val === 'object' ? val : { progress: val, current: val === 100 ? total : 0, total };
        this.realtimeGateway.emitImportProgress(orgId, jobId, stats);
      };

      await setProgress({ progress: 1, current: 0, total });
      
      // Phase 2: Processing in batches with progress updates
      await this.contactsService.atomicBulkImport(orgId, contacts, async (stats) => {
         const p = Math.max(1, Math.floor((stats.current / stats.total) * 100));
         await setProgress({ ...stats, progress: p });
      });

      await setProgress({ progress: 100, current: total, total });

      this.logger.log(`✅ Import completed successfully for Org: ${orgId}`);
      return { success: true, count: total };
    } catch (err: any) {
      this.logger.error(`❌ Import failed for Org: ${orgId}: ${err.message}`);
      
      // Notify UI of failure immediately via socket
      try {
        await job.updateProgress({ progress: 0, error: err.message, status: 'FAILED' });
        this.realtimeGateway.emitImportProgress(orgId, jobId, { progress: 0, error: err.message, status: 'FAILED' });
      } catch (e) {}

      throw err; 
    }
  }
}


