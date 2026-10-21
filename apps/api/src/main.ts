import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadEnv } from '@techmunda/core';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap() {
  const env = loadEnv(); // fails fast on missing/short secrets
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  configureApp(app, { swagger: true });
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, '0.0.0.0');
  app.get(Logger).log(`API listening on :${env.API_PORT} (docs: /api/docs)`);
}
void bootstrap();
