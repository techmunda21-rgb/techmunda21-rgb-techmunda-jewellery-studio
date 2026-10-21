import path from 'path';
import os from 'os';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://techmunda:techmunda_dev@localhost:5432/jewellery_studio_test?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012345678',
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  URL_SIGNING_SECRET: 'test-url-signing-secret-0123456789abcdef',
  AUTOMATION_WEBHOOK_SECRET: 'test-automation-secret-123456',
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_DIR: path.join(os.tmpdir(), 'techmunda-test-storage'),
  AI_MODE: 'simulated',
  QUEUE_MODE: 'inline',
  API_PUBLIC_URL: 'http://localhost:4000',
  LOG_LEVEL: 'silent',
  ALERT_EMAIL: 'ops@alerts.test',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
});
delete process.env.OPENAI_API_KEY;
