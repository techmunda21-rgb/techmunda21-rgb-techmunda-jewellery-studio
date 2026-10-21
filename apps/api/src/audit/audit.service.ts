import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@techmunda/database';
import { recordActivity, recordAudit, type ActivityInput, type AuditInput } from '@techmunda/core';
import { PRISMA, type PrismaDb } from '../common/tokens';

/**
 * Audit + activity writes. A failure to write an audit row must not be silent for
 * security events, so audit() propagates errors; activity() is best-effort for UX timelines.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb) {}

  audit(input: AuditInput, db: PrismaDb | Prisma.TransactionClient = this.prisma) {
    return recordAudit(db, input);
  }
  async activity(input: ActivityInput, db: PrismaDb | Prisma.TransactionClient = this.prisma) {
    try {
      return await recordActivity(db, input);
    } catch (e) {
      this.logger.warn(`activity write failed: ${(e as Error).message}`);
      return null;
    }
  }
}
