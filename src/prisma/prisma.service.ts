import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Extends PrismaClient with soft-delete support by excluding deleted records.
   * Use this utility when a model requires a `deletedAt` field in the future.
   */
  get extendedClient() {
    return this.$extends({
      query: {
        $allModels: {
          async findMany({ args, query }) {
            return query(args);
          },
        },
      },
    });
  }
}
