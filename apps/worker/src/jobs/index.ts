import { Worker } from 'bullmq';
import pino from 'pino';
import { QUEUE_NAMES, REDACT_PATHS, createStorage, type CreativeJobData, type QualificationJobData } from '@techmunda/core';
import { prisma } from '@techmunda/database';
import { creativeProcessor } from '../processors/creative.processor';
import { qualificationProcessor } from '../processors/qualification.processor';
import { connection, env } from '../queues/connection';

const log = pino({ level: env.LOG_LEVEL, redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } });

/**
 * Background workers. These only qualify leads and generate creative drafts.
 * There is deliberately NO queue or processor that sends e-mail: sending is only reachable through the
 * authenticated API (or a signed human confirmation), never from a background job.
 */
export function startWorkers() {
  const deps = { prisma, env, storage: createStorage(env) };
  const qualify = qualificationProcessor(deps);
  const creative = creativeProcessor(deps);

  const workers = [
    new Worker<QualificationJobData>(QUEUE_NAMES.qualification, (job) => qualify(job.data), { connection, concurrency: 4 }),
    new Worker<CreativeJobData>(QUEUE_NAMES.creative, (job) => creative(job.data), { connection, concurrency: 2 }),
  ];
  for (const w of workers) {
    w.on('completed', (job) => log.info({ queue: w.name, jobId: job.id }, 'job completed'));
    w.on('failed', (job, err) => log.error({ queue: w.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job failed'));
  }
  return workers;
}
