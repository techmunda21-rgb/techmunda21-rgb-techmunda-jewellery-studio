import { startWorkers } from './jobs';
import { prisma } from '@techmunda/database';
import { connection } from './queues/connection';

const workers = startWorkers();
console.log(`worker started: ${workers.map((w) => w.name).join(', ')}`);

async function shutdown() {
  await Promise.allSettled(workers.map((w) => w.close()));
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
