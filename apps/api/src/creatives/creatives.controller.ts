import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { assetApproveSchema, assetReviewSchema, creativeJobSchema, CREATIVE_APPROVER_ROLES } from '@techmunda/shared';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { CreativesService } from './creatives.service';

const MAKERS = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER'] as const;

@ApiTags('Creative Studio')
@Controller('creatives')
export class CreativesController {
  constructor(private readonly svc: CreativesService) {}

  @Post('jobs')
  @Roles(...MAKERS)
  @Doc('Create a creative job from an authorised original image', creativeJobSchema)
  create(@CurrentUser() u: AuthUser, @Body(zod(creativeJobSchema)) body: any) {
    return this.svc.createJob(u, body);
  }

  @Get('jobs')
  @Doc('Recent creative jobs')
  jobs(@CurrentUser() u: AuthUser, @Query('productId') productId?: string) {
    return this.svc.listJobs(u, productId);
  }

  @Get('jobs/:id')
  @Doc('Creative job status with generated assets and provenance')
  job(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getJob(u, id);
  }

  @Get('assets')
  @Doc('Generated assets (filter by review status)')
  assets(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('productId') productId?: string) {
    return this.svc.listAssets(u, status, productId);
  }

  @Post('assets/:id/submit-review')
  @Roles(...MAKERS)
  @Doc('Submit an asset for human approval')
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.submitReview(u, id);
  }

  @Post('assets/:id/approve')
  @Roles(...CREATIVE_APPROVER_ROLES)
  @Doc('Approve an asset (requires accuracy checklist confirmation)', assetApproveSchema)
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(assetApproveSchema)) body: { notes?: string }) {
    return this.svc.decide(u, id, 'APPROVED', body.notes);
  }

  @Post('assets/:id/reject')
  @Roles(...CREATIVE_APPROVER_ROLES)
  @Doc('Reject an asset', assetReviewSchema)
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zod(assetReviewSchema)) body: { notes?: string }) {
    return this.svc.decide(u, id, 'REJECTED', body.notes);
  }

  @Get('assets/:id/export')
  @Doc('Signed download URL — approved assets only')
  export(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.exportAsset(u, id);
  }
}
