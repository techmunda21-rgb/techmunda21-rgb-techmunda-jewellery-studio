import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CommunicationsModule } from '../communications/communications.module';
import { LeadsModule } from '../leads/leads.module';
import { AutomationController } from './automation.controller';
import { AutomationGuard } from './automation.guard';
import { AutomationService } from './automation.service';

@Module({ imports: [LeadsModule, CommunicationsModule, AnalyticsModule], controllers: [AutomationController], providers: [AutomationService, AutomationGuard] })
export class AutomationModule {}
