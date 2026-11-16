import { sourceRepository } from '../src/domain/SourceRepository';
import { createApp } from './app';
import { UsageBudget } from './budget';
import { loadConfig } from './config';
import { OpenAiLlmClient } from './llm';
import { SuggestionService } from './suggestionService';

const config = loadConfig();
const budget = new UsageBudget(config.tokenBudget, config.rateLimitPerMinute);
const llm = config.openaiApiKey ? new OpenAiLlmClient(config) : undefined;
const service = new SuggestionService({ repository: sourceRepository, llm, budget });

createApp(config, service, budget).listen(config.port, '0.0.0.0', () => {
  console.log(`Digital Self listening on http://localhost:${config.port}`);
  console.log(llm
    ? `AI enabled: ${config.chatModel} + ${config.embeddingModel} (budget ${config.tokenBudget} tokens, ${config.rateLimitPerMinute}/min)`
    : 'AI disabled: OPENAI_API_KEY is not set. The deterministic engine answers every request.');
  if (config.staticDir) console.log(`Serving web app from ${config.staticDir}`);
});
