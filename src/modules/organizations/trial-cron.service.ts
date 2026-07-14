import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrialCronService {
  private readonly logger = new Logger(TrialCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run every hour to check for expired trials
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredTrials() {
    this.logger.log('Checking for expired trials...');
    
    try {
      const now = new Date();
      
      const expiredOrganizations = await this.prisma.organization.findMany({
        where: {
          subscriptionStatus: 'TRIAL',
          trialEndsAt: {
            lt: now,
          },
          status: 'ACTIVE', // Only update active organizations
        },
      });

      if (expiredOrganizations.length > 0) {
        this.logger.log(`Found ${expiredOrganizations.length} expired trials. Processing deactivation...`);

        const ids = expiredOrganizations.map(org => org.id);

        await this.prisma.organization.updateMany({
          where: {
            id: { in: ids }
          },
          data: {
            subscriptionStatus: 'TRIAL_EXPIRED',
            status: 'INACTIVE'
          }
        });

        this.logger.log(`Successfully deactivated ${ids.length} organizations whose trials expired.`);
      } else {
        this.logger.log('No expired trials found.');
      }
    } catch (error) {
      this.logger.error('Error processing expired trials:', error);
    }
  }
}
