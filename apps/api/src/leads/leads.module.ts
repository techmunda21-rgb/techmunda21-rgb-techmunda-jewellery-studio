import { Module } from '@nestjs/common';
import { LeadsController, PublicLeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({ controllers: [PublicLeadsController, LeadsController], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
