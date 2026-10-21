import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { REDACT_PATHS, loadEnv } from '@techmunda/core';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AutomationModule } from './automation/automation.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CommunicationsModule } from './communications/communications.module';
import { AllExceptionsFilter } from './common/errors.filter';
import { CoreModule } from './common/core.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { ContactsModule } from './contacts/contacts.module';
import { CreativesModule } from './creatives/creatives.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LeadsModule } from './leads/leads.module';
import { MediaModule } from './media/media.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ProductsModule } from './products/products.module';
import { SecurityModule } from './security/security.module';
import { AccountModule } from './account/account.module';
import { SignupModule } from './signup/signup.module';
import { ShowcaseModule } from './showcase/showcase.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: loadEnv().LOG_LEVEL,
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
        autoLogging: { ignore: (req) => req.url?.includes('/media/file/') ?? false },
        serializers: { req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0].replace(/\/(file|upload)\/[^/]+/, '/$1/[token]') }) },
        transport: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' ? undefined : undefined,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 240 }]),
    CoreModule, SecurityModule, AuthModule, UsersModule, TenantsModule, ProductsModule, MediaModule, AiModule, CreativesModule, CampaignsModule,
    LeadsModule, ContactsModule, OpportunitiesModule, CommunicationsModule, ApprovalsModule, IntegrationsModule, AnalyticsModule, AuditModule, AutomationModule, ShowcaseModule, SignupModule, AccountModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
