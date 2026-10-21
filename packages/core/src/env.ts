import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().default(4000),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  /** base64 of 32 random bytes. Used for AES-256-GCM encryption of OAuth tokens. */
  ENCRYPTION_KEY: z.string().min(40, 'ENCRYPTION_KEY must be base64 of 32 bytes'),
  URL_SIGNING_SECRET: z.string().min(32),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage-data'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('jewellery-studio'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  /** auto = use OpenAI when OPENAI_API_KEY is set, else clearly-labelled simulation. */
  AI_MODE: z.enum(['auto', 'openai', 'simulated']).default('auto'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TEXT_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/api/v1/integrations/google/callback'),
  GMAIL_DESIRED_SENDER: z.string().optional(),

  AUTOMATION_WEBHOOK_SECRET: z.string().min(16).default('change-me-automation-secret'),
  TURNSTILE_SECRET: z.string().optional(),
  QUEUE_MODE: z.enum(['redis', 'inline']).default('redis'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validates process.env once. Fails fast with a readable list of problems. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache() {
  cached = undefined;
}

export const isOpenAiConfigured = (env: Env) => !!env.OPENAI_API_KEY && env.AI_MODE !== 'simulated';
export const isGoogleConfigured = (env: Env) => !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
