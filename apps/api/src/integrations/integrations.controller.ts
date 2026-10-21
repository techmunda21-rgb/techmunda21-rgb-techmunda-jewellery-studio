import { Controller, Delete, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Doc, Public, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { GMAIL_GATEWAY, type GmailGateway } from './gmail.gateway';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService, @Inject(GMAIL_GATEWAY) private readonly gmail: GmailGateway) {}

  @Get('status')
  @Doc('Integration and AI mode status (live vs simulated)')
  status(@CurrentUser() u: AuthUser) {
    return this.svc.status(u.tenantId);
  }

  @Get('google/connect')
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER')
  @Doc('Begin Google OAuth (returns the consent URL)')
  connect(@CurrentUser() u: AuthUser) {
    return this.svc.connectUrl(u);
  }

  @Public()
  @Get('google/callback')
  @Doc('Google OAuth redirect target')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    res.redirect(await this.svc.handleCallback(code, state, error));
  }

  @Delete('google')
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER')
  @Doc('Disconnect the Google account and revoke the token')
  disconnect(@CurrentUser() u: AuthUser) {
    return this.svc.disconnect(u, this.gmail.revoke?.bind(this.gmail));
  }
}
