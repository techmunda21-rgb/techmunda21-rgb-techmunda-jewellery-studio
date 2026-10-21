import { Global, Inject, Module } from '@nestjs/common';
import { ENV, type AppEnv } from '../common/tokens';
import { GMAIL_GATEWAY, GoogleGmailGateway } from './gmail.gateway';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    {
      provide: GMAIL_GATEWAY,
      inject: [ENV, IntegrationsService],
      useFactory: (env: AppEnv, integrations: IntegrationsService) =>
        new GoogleGmailGateway({ clientId: env.GOOGLE_CLIENT_ID ?? '', clientSecret: env.GOOGLE_CLIENT_SECRET ?? '', redirectUri: env.GOOGLE_REDIRECT_URI }, (id, t) => integrations.persistTokens(id, t)),
    },
  ],
  exports: [IntegrationsService, GMAIL_GATEWAY],
})
export class IntegrationsModule {}
