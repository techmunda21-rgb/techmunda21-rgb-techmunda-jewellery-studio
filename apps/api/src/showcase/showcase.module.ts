import { Module } from '@nestjs/common';
import { ShowcaseController } from './showcase.controller';
import { ShowcaseService } from './showcase.service';

@Module({ controllers: [ShowcaseController], providers: [ShowcaseService] })
export class ShowcaseModule {}
