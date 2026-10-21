import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { loadEnv } from '@techmunda/core';

/** Shared by main.ts and the e2e tests so both exercise identical middleware. */
export function configureApp(app: INestApplication, opts: { swagger?: boolean } = {}) {
  const env = loadEnv();
  const http = app.getHttpAdapter().getInstance();
  http.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: false, allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  // raw bytes for signed uploads (10 MB cap), JSON with rawBody retained for webhook HMAC verification
  app.use('/api/v1/media/upload', express.raw({ type: () => true, limit: '10mb' }));
  app.use('/api/v1/showcase', express.raw({ type: 'application/pdf', limit: '25mb' }));
  app.use(express.json({ limit: '2mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.setGlobalPrefix('api/v1');

  if (opts.swagger) {
    const doc = new DocumentBuilder().setTitle('Techmunda AI Jewellery Growth Studio API').setDescription('Multi-tenant REST API. All routes except /public/*, /auth/*, signed media links and the OAuth callback require a Bearer access token.').setVersion('0.1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }
}
