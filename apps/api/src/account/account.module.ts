import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { RetentionService } from './retention.service';

@Module({ controllers: [AccountController], providers: [RetentionService] })
export class AccountModule {}
