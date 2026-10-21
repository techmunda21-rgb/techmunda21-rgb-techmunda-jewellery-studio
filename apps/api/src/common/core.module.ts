import { Global, Module } from '@nestjs/common';
import { createStorage, loadEnv } from '@techmunda/core';
import { prisma } from '@techmunda/database';
import { QueueService } from './queue.service';
import { ENV, PRISMA, STORAGE } from './tokens';
import { AuditService } from '../audit/audit.service';
import { MediaUrlService } from '../media/media-url.service';

@Global()
@Module({
  providers: [
    { provide: PRISMA, useValue: prisma },
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: STORAGE, useFactory: () => createStorage(loadEnv()) },
    QueueService,
    AuditService,
    MediaUrlService,
  ],
  exports: [PRISMA, ENV, STORAGE, QueueService, AuditService, MediaUrlService],
})
export class CoreModule {}
