import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Doc } from '../common/decorators';
import { PRISMA, type PrismaDb } from '../common/tokens';
import type { AuthUser } from '../common/types';

@ApiTags('Users')
@Controller()
export class UsersController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaDb) {}

  @Get('users')
  @Doc('Team members in the tenant (for assignment)')
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.user.findMany({ where: { tenantId: user.tenantId, status: 'ACTIVE' }, select: { id: true, fullName: true, email: true, role: true }, orderBy: { fullName: 'asc' } });
    return { data: rows };
  }

  @Get('tenants/current')
  @Doc('Current tenant profile')
  async tenant(@CurrentUser() user: AuthUser) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { id: true, name: true, slug: true, country: true, currency: true, timezone: true, status: true } });
  }

  @Get('notifications')
  @Doc('My in-app notifications')
  async notifications(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.notification.findMany({ where: { tenantId: user.tenantId, userId: user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { data: rows };
  }
}
