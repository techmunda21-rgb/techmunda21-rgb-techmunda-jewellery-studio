import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Doc, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { ShowcaseService } from './showcase.service';

const WRITE = ['PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER'] as const;

@ApiTags('Showcase')
@Controller('showcase')
export class ShowcaseController {
  constructor(private readonly svc: ShowcaseService) {}

  @Get()
  @Doc('Showcase PDFs (the active one is shown on the dashboard)')
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }

  @Put()
  @Roles(...WRITE)
  @Doc('Upload a design/lookbook/price-catalogue PDF as the dashboard showcase (raw body, Content-Type: application/pdf, ?title=)')
  upload(@CurrentUser() u: AuthUser, @Query('title') title: string | undefined, @Req() req: Request) {
    return this.svc.upload(u, (title ?? 'Design showcase').trim() || 'Design showcase', req.body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles(...WRITE)
  @Doc('Show this PDF on the dashboard')
  activate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.activate(u, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER')
  @Doc('Delete a showcase PDF')
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.remove(u, id);
  }
}
