/** Server-only configuration. Secrets are read from the process environment and never reach the browser bundle. */
export interface ServerConfig {
  port: number;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  /** Hard cap on tokens one server process may spend; afterwards the deterministic engine answers. */
  tokenBudget: number;
  /** Requests per minute that may reach the model. Extra requests fall back instead of queueing. */
  rateLimitPerMinute: number;
  requestTimeoutMs: number;
  staticDir?: string;
}

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const key = env.OPENAI_API_KEY?.trim();
  const effort = env.OPENAI_REASONING_EFFORT;
  return {
    port: number(env.PORT, 3000),
    // An empty or placeholder value means "run without AI", which keeps the demo usable offline.
    openaiApiKey: key && !/^(|changeme|your[-_ ]?key.*|sk-\.\.\.)$/i.test(key) ? key : undefined,
    openaiBaseUrl: env.OPENAI_BASE_URL?.trim() || undefined,
    chatModel: env.OPENAI_MODEL?.trim() || 'gpt-6-luna',
    embeddingModel: env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-large',
    embeddingDimensions: number(env.OPENAI_EMBEDDING_DIMENSIONS, 512),
    reasoningEffort: effort === 'none' || effort === 'medium' || effort === 'high' ? effort : 'low',
    tokenBudget: number(env.AI_TOKEN_BUDGET, 1_500_000),
    rateLimitPerMinute: number(env.AI_RATE_LIMIT_PER_MINUTE, 60),
    requestTimeoutMs: number(env.AI_REQUEST_TIMEOUT_MS, 20_000),
    staticDir: env.STATIC_DIR?.trim() || 'dist',
  };
}
