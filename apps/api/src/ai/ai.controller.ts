import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isGoogleConfigured, isOpenAiConfigured } from '@techmunda/core';
import { Doc } from '../common/decorators';
import { ENV, type AppEnv } from '../common/tokens';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  /** Lets the UI label live vs simulated behaviour honestly. */
  @Get('status')
  @Doc('Which AI features run live and which are clearly-labelled simulations')
  status() {
    const live = isOpenAiConfigured(this.env);
    return {
      text: { mode: live ? 'LIVE' : 'SIMULATED', provider: live ? 'openai' : 'rule-based-simulation', model: live ? this.env.OPENAI_TEXT_MODEL : null },
      image: { mode: live ? 'LIVE' : 'SIMULATED', provider: live ? 'openai-image' : 'demo-simulation', model: live ? this.env.OPENAI_IMAGE_MODEL : null },
      gmail: { mode: isGoogleConfigured(this.env) ? 'OAUTH_CONFIGURED' : 'NOT_CONFIGURED' },
      storage: this.env.STORAGE_DRIVER,
      queue: this.env.QUEUE_MODE,
    };
  }
}
