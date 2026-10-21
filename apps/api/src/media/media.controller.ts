import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { confirmUploadSchema, uploadUrlSchema } from '@techmunda/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Doc, Public, Roles } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { MediaService } from './media.service';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER')
  @Doc('Request a signed upload URL (requires confirmation that the image is client-authorised)', uploadUrlSchema)
  uploadUrl(@CurrentUser() user: AuthUser, @Body(zod(uploadUrlSchema)) body: any) {
    return this.media.createUploadUrl(user, body);
  }

  @Public()
  @Put('upload/:token')
  @HttpCode(204)
  async upload(@Param('token') token: string, @Req() req: Request) {
    await this.media.receiveLocalUpload(token, req.body, req.headers['content-type']);
  }

  @Post('confirm')
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER')
  @Doc('Validate and register an uploaded file', confirmUploadSchema)
  confirm(@CurrentUser() user: AuthUser, @Body(zod(confirmUploadSchema)) body: { uploadToken: string }) {
    return this.media.confirm(user, body.uploadToken);
  }

  @Public()
  @Get('file/:token')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, max-age=600')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async file(@Param('token') token: string, @Res() res: Response) {
    const f = await this.media.readSigned(token);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `${f.download ? 'attachment' : 'inline'}; filename="${f.name}"`);
    res.send(f.data);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('PLATFORM_ADMIN', 'TENANT_OWNER', 'MANAGER', 'DESIGNER')
  @Doc('Delete an uploaded image / frame')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.media.remove(user, id);
  }

  @Get(':id')
  @Doc('Get media metadata and a short-lived view URL')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.get(user, id);
  }
}
