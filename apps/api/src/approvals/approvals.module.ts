import { Module } from '@nestjs/common';
import { CommunicationsModule } from '../communications/communications.module';
import { CreativesModule } from '../creatives/creatives.module';
import { ApprovalsController } from './approvals.controller';

@Module({ imports: [CreativesModule, CommunicationsModule], controllers: [ApprovalsController] })
export class ApprovalsModule {}
