import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, refreshSchema } from '@techmunda/shared';
import { ClientIp, CurrentUser, Doc, Public } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { zod } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { Inject } from '@nestjs/common';
import { PRISMA, type PrismaDb } from '../common/tokens';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(PRISMA) private readonly prisma: PrismaDb) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @Doc('Sign in with email and password', loginSchema)
  login(@Body(zod(loginSchema)) body: { email: string; password: string; tenantSlug?: string }, @ClientIp() ip: string) {
    return this.auth.login(body.email, body.password, body.tenantSlug, ip);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @Doc('Rotate the refresh token and obtain a new access token', refreshSchema)
  refresh(@Body(zod(refreshSchema)) body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Doc('Revoke the refresh-token family')
  async logout(@Body() body: { refreshToken?: string }) {
    await this.auth.logout(typeof body?.refreshToken === 'string' ? body.refreshToken : undefined);
  }

  @Get('me')
  @Doc('Current user and tenant')
  async me(@CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { id: true, name: true, slug: true, country: true, currency: true, timezone: true } });
    return { user, tenant };
  }
}
