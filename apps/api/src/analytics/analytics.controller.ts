import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Doc } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}
  @Get('overview') @Doc('Daily sales dashboard KPIs, revenue trend and funnel')
  overview(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    const d = Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 365);
    return this.svc.overview(u.tenantId, d);
  }
  @Get('leads') @Doc('Lead analytics')
  leads(@CurrentUser() u: AuthUser) {
    return this.svc.leads(u.tenantId);
  }
  @Get('campaigns') @Doc('Campaign and content production analytics')
  campaigns(@CurrentUser() u: AuthUser) {
    return this.svc.campaigns(u.tenantId);
  }
}
