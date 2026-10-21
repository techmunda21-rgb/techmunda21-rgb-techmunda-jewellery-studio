export type AiSource = 'LLM' | 'SIMULATED_RULES';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'POLICY_REJECTED',
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
