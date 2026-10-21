import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUE_NAMES = {
  qualification: 'lead-qualification',
  creative: 'creative-jobs',
} as const;

export interface QualificationJobData {
  tenantId: string;
  leadId: string;
}
export interface CreativeJobData {
  tenantId: string;
  creativeJobId: string;
}

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};

export function createRedis(url: string) {
  // BullMQ requires maxRetriesPerRequest: null on worker connections.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function createQueue<T>(name: string, connection: IORedis) {
  return new Queue<T>(name, { connection, defaultJobOptions });
}
