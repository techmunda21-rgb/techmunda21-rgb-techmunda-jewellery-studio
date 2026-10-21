import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';

@Module({ imports: [LeadsModule], controllers: [CommunicationsController], providers: [CommunicationsService], exports: [CommunicationsService] })
export class CommunicationsModule {}
