import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { signupResendSchema, signupStartSchema, signupVerifySchema } from '@techmunda/shared';
import type { z } from 'zod';
import { ClientIp, Doc, Public } from '../common/decorators';
import { zod } from '../common/zod.pipe';
import { SignupService } from './signup.service';

@ApiTags('Signup')
@Public()
@Controller('public/signup')
export class SignupController {
  constructor(private readonly svc: SignupService) {}

  @Get('config')
  @Doc('Which verification channels are available, current policy version')
  config() {
    return this.svc.config();
  }

  @Post('start')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Doc('Start a demo-workspace signup: validates, stores nothing until the code is delivered, sends a one-time code', signupStartSchema)
  start(@Body(zod(signupStartSchema)) b: z.infer<typeof signupStartSchema>, @ClientIp() ip: string) {
    return this.svc.start(b, ip);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Doc('Verify the one-time code; creates the demo workspace + owner and signs in', signupVerifySchema)
  verify(@Body(zod(signupVerifySchema)) b: { requestId: string; code: string }, @ClientIp() ip: string) {
    return this.svc.verify(b.requestId, b.code, ip);
  }

  @Post('resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Doc('Resend the code (60 s cooldown, max 3)', signupResendSchema)
  resend(@Body(zod(signupResendSchema)) b: { requestId: string }) {
    return this.svc.resend(b.requestId);
  }
}
