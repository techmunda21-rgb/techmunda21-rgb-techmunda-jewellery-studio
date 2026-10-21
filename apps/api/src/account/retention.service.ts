import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { purgeExpiredDemos } from '@techmunda/core';
import { PRISMA, STORAGE, type AppStorage, type PrismaDb } from '../common/tokens';

/** Enforces the published retention period: expired self-service demo workspaces are deleted (every 6 h and at startup). */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Retention');
  private timer?: NodeJS.Timeout;
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb, @Inject(STORAGE) private readonly storage: AppStorage) {}

  async run() {
    try {
      const r = await purgeExpiredDemos(this.prisma, this.storage);
      if (r.tenantsDeleted || r.signupRequestsDeleted) this.log.log(`purged ${r.tenantsDeleted} expired demo workspace(s), ${r.signupRequestsDeleted} stale signup request(s)`);
    } catch (e) {
      this.log.error(`retention purge failed: ${(e as Error).message}`);
    }
  }
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 6 * 3_600_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
