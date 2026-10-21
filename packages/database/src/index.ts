import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

/** Shared PrismaClient singleton (one connection pool per process). */
export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;
