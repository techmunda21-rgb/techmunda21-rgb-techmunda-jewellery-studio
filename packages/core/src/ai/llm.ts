import OpenAI from 'openai';
import type { ZodType } from 'zod';
import { isOpenAiConfigured, type Env } from '../env';
import { scrubSecrets } from '../redact';
import { ProviderError } from './types';

export interface JsonCompletionRequest<T> {
  system: string;
  /** Untrusted content goes here, already wrapped in delimiters by the caller. */
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
}

export interface TextLLM {
  readonly name: string;
  completeJson<T>(req: JsonCompletionRequest<T>): Promise<T>;
}

export function mapOpenAiError(err: unknown): ProviderError {
  const e = err as { status?: number; message?: string };
  const msg = scrubSecrets(e?.message ?? 'Unknown provider error');
  if (e?.status === 429) return new ProviderError(`AI provider rate limited: ${msg}`, 'RATE_LIMITED', true);
  if (e?.status === 401 || e?.status === 403) return new ProviderError('AI provider rejected the API credentials', 'NOT_CONFIGURED', false);
  if (e?.status && e.status >= 500) return new ProviderError(`AI provider unavailable: ${msg}`, 'PROVIDER_ERROR', true);
  return new ProviderError(`AI provider error: ${msg}`, 'PROVIDER_ERROR', false);
}

export class OpenAiTextLLM implements TextLLM {
  readonly name = 'openai';
  private readonly client: OpenAI;
  constructor(private readonly env: Env) {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
  }

  async completeJson<T>(req: JsonCompletionRequest<T>): Promise<T> {
    let lastIssue = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      let content: string | null | undefined;
      try {
        const res = await this.client.chat.completions.create({
          model: this.env.OPENAI_TEXT_MODEL,
          temperature: 0.2,
          max_tokens: req.maxTokens ?? 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system + (lastIssue ? `\nYour previous output was invalid: ${lastIssue}. Return valid JSON only.` : '') },
            { role: 'user', content: req.user },
          ],
        });
        content = res.choices[0]?.message?.content;
      } catch (err) {
        throw mapOpenAiError(err);
      }
      try {
        const parsed = req.schema.safeParse(JSON.parse(content ?? ''));
        if (parsed.success) return parsed.data;
        lastIssue = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      } catch {
        lastIssue = 'not valid JSON';
      }
    }
    throw new ProviderError(`AI output failed schema validation (${lastIssue})`, 'INVALID_OUTPUT', false);
  }
}

/** Returns an LLM client, or null when no provider credentials are configured. */
export function getTextLLM(env: Env): TextLLM | null {
  if (env.AI_MODE === 'openai' && !env.OPENAI_API_KEY) {
    throw new ProviderError('AI_MODE=openai but OPENAI_API_KEY is missing', 'NOT_CONFIGURED');
  }
  return isOpenAiConfigured(env) ? new OpenAiTextLLM(env) : null;
}
