import { sourceRepository } from '../src/domain/SourceRepository';
import { createApp } from './app';
import { UsageBudget } from './budget';
import { loadConfig } from './config';
import { OpenAiLlmClient } from './llm';
import { SuggestionService } from './suggestionService';
import path from 'node:path';
import { getSetting, openDatabase, setSetting } from './twin/db';
import { counts, loadDemoPersona, type TwinContext } from './twin/routes';

const config = loadConfig();
const budget = new UsageBudget(config.tokenBudget, config.rateLimitPerMinute);
const llm = config.openaiApiKey ? new OpenAiLlmClient(config) : undefined;
const disabledReason = config.aiPaused ? 'Το AI είναι σε παύση (AI_ENABLED)· απαντούν οι deterministic κανόνες.' : undefined;
const service = new SuggestionService({ repository: sourceRepository, llm, budget, disabledReason });

const db = openDatabase(path.join(config.dataDir, 'twin.db'));
const twin: TwinContext = { db, sampleDir: process.env.SAMPLE_DATA_DIR?.trim() || 'sample-data' };

// First start: build the demo twin from the bundled synthetic exports, through the real import pipeline.
if (process.env.SEED_DEMO !== 'false' && !counts(db).messages && !getSetting(db, 'seeded_once', false)) {
  const reports = await loadDemoPersona(twin);
  setSetting(db, 'seeded_once', true);
  console.log(`Seeded the demo persona from ${reports.length} sample exports (${counts(db).messages} messages).`);
}

createApp(config, service, budget, twin).listen(config.port, '0.0.0.0', () => {
  console.log(`Digital Self listening on http://localhost:${config.port}`);
  console.log(llm
    ? `AI enabled: ${config.chatModel} + ${config.embeddingModel} (budget ${config.tokenBudget} tokens, ${config.rateLimitPerMinute}/min)`
    : config.aiPaused
      ? 'AI paused: AI_ENABLED is not true, so OpenAI is never called. The deterministic engine answers every request.'
      : 'AI disabled: OPENAI_API_KEY is not set. The deterministic engine answers every request.');
  if (config.staticDir) console.log(`Serving web app from ${config.staticDir}`);
});
