import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationSchema } from '@techmunda/shared';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import { pageArgs, paged } from '../common/helpers';
import { PRISMA, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb) {}

  @Get()
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER')
  @Doc('List audit log entries for the tenant')
  async list(@CurrentUser() user: AuthUser, @Query(zod(paginationSchema)) q: { page: number; pageSize: number }) {
    const where = { tenantId: user.tenantId };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q.page, q.pageSize) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(rows, total, q.page, q.pageSize);
  }
}
