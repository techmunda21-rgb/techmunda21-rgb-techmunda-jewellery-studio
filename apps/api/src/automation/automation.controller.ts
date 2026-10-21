import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { publicLeadSchema } from '@techmunda/shared';
import { z } from 'zod';
import { Public } from '../common/decorators';
import { zod } from '../common/zod.pipe';
import { AutomationGuard } from './automation.guard';
import { AutomationService } from './automation.service';

const corr = z.object({ correlationId: z.string().min(8).max(120) });
const leadBody = corr.extend({ lead: publicLeadSchema });
const sendBody = corr.extend({ confirmationToken: z.string().min(20).max(2000) });
const followBody = corr.extend({ limit: z.number().int().min(1).max(25).optional() });

/** Machine endpoints for n8n. HMAC-authenticated per tenant (see docs/SECURITY.md). Hidden from the public OpenAPI. */
@ApiExcludeController()
@Public()
@UseGuards(AutomationGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}

  @Post('lead-capture') @HttpCode(200)
  lead(@Req() req: any, @Body(zod(leadBody)) b: z.infer<typeof leadBody>) {
    return this.svc.leadCapture(req.automationTenantId, b.correlationId, { ...b.lead, website: undefined } as any);
  }

  @Post('creative-jobs/:id/process') @HttpCode(200)
  creative(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body(zod(corr)) b: { correlationId: string }) {
    return this.svc.creativeJob(req.automationTenantId, b.correlationId, id);
  }

  @Post('followups/draft-due') @HttpCode(200)
  followups(@Req() req: any, @Body(zod(followBody)) b: z.infer<typeof followBody>) {
    return this.svc.followUpDue(req.automationTenantId, b.correlationId, b.limit);
  }

  @Post('send-approved') @HttpCode(200)
  send(@Req() req: any, @Body(zod(sendBody)) b: z.infer<typeof sendBody>) {
    return this.svc.sendApproved(req.automationTenantId, b.correlationId, b.confirmationToken);
  }

  @Post('daily-report') @HttpCode(200)
  report(@Req() req: any, @Body(zod(corr)) b: { correlationId: string }) {
    return this.svc.dailyReport(req.automationTenantId, b.correlationId);
  }
}
