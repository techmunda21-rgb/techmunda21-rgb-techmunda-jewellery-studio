import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES, createQueue, createRedis, processCreativeJob, processQualification, type CreativeJobData, type QualificationJobData } from '@techmunda/core';
import { ENV, PRISMA, STORAGE, type AppEnv, type AppStorage, type PrismaDb } from './tokens';

/** QUEUE_MODE=redis → BullMQ (worker process). QUEUE_MODE=inline → run immediately (tests / single-process demos). */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('Queues');
  private redis?: ReturnType<typeof createRedis>;
  private qualification?: Queue<QualificationJobData>;
  private creative?: Queue<CreativeJobData>;

  constructor(@Inject(ENV) private readonly env: AppEnv, @Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(STORAGE) private readonly storage: AppStorage) {}

  private ensure() {
    if (this.redis) return;
    this.redis = createRedis(this.env.REDIS_URL);
    this.redis.on('error', (e) => this.logger.warn(`Redis error: ${e.message}`));
    this.qualification = createQueue<QualificationJobData>(QUEUE_NAMES.qualification, this.redis);
    this.creative = createQueue<CreativeJobData>(QUEUE_NAMES.creative, this.redis);
  }

  async enqueueQualification(data: QualificationJobData) {
    if (this.env.QUEUE_MODE === 'inline') {
      try {
        await processQualification({ prisma: this.prisma, env: this.env, storage: this.storage }, data);
      } catch (e) {
        this.logger.error(`Inline qualification failed: ${(e as Error).message}`);
      }
      return;
    }
    this.ensure();
    await this.qualification!.add('qualify', data, { jobId: `qualify-${data.leadId}-${Date.now()}` });
  }

  async enqueueCreative(data: CreativeJobData) {
    if (this.env.QUEUE_MODE === 'inline') {
      await processCreativeJob({ prisma: this.prisma, env: this.env, storage: this.storage }, data);
      return;
    }
    this.ensure();
    await this.creative!.add('generate', data, { jobId: `creative-${data.creativeJobId}-${Date.now()}` });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.qualification?.close(), this.creative?.close()]);
    this.redis?.disconnect();
  }
}
