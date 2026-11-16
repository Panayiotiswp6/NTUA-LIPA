import { sourceRepository } from '../src/domain/SourceRepository';
import { createApp } from './app';
import { UsageBudget } from './budget';
import { loadConfig } from './config';
import { OpenAiLlmClient } from './llm';
import { SuggestionService } from './suggestionService';
import path from 'node:path';
import { getSetting, openDatabase, setSetting } from './twin/db';
import { counts, loadDemoPersona, type TwinContext } from './twin/routes';
import { refreshPersona } from './twin/persona';
import { evaluate } from './twin/fidelity';
import { TwinEngine } from './twin/engine';
import type { Relationship as DemoRelationship } from '../src/domain/types';
import type { Relationship } from './twin/types';

const RELATIONSHIP_FROM_DEMO: Record<DemoRelationship, Relationship> = { friend: 'friend', classmate: 'study', professor: 'work' };

const config = loadConfig();
const budget = new UsageBudget(config.tokenBudget, config.rateLimitPerMinute);
const llm = config.openaiApiKey ? new OpenAiLlmClient(config) : undefined;

const db = openDatabase(path.join(config.dataDir, 'twin.db'));
const twinEngine = new TwinEngine(db, llm, budget);
const disabledReason = config.aiPaused ? 'Το AI είναι σε παύση (AI_ENABLED)· απαντούν οι deterministic κανόνες.' : undefined;
const service = new SuggestionService({
  repository: sourceRepository, llm, budget, disabledReason,
  exemplars: (incoming, context) => twinEngine.situational(incoming, context.channel === 'gmail' ? 'gmail' : 'instagram', RELATIONSHIP_FROM_DEMO[context.contact.relationship], context.contact.name),
});
const twin: TwinContext = { db, sampleDir: process.env.SAMPLE_DATA_DIR?.trim() || 'sample-data', llm, budget, onDataChanged: () => { refreshPersona(db); twinEngine.invalidate(); } };

// First start: build the demo twin from the bundled synthetic exports, through the real import pipeline.
if (process.env.SEED_DEMO !== 'false' && !counts(db).messages && !getSetting(db, 'seeded_once', false)) {
  const reports = await loadDemoPersona(twin);
  setSetting(db, 'seeded_once', true);
  console.log(`Seeded the demo persona from ${reports.length} sample exports (${counts(db).messages} messages).`);
}

// Style and rule-based persona are derived data; rebuild them on start so code changes apply to stored data.
refreshPersona(db);

createApp(config, service, budget, twin).listen(config.port, '0.0.0.0', () => {
  // Answer the hold-out set once now, so the first visitor of the overview or the Fidelity Lab does not wait.
  setTimeout(() => { void evaluate(db).catch(() => undefined); }, 50).unref();
  console.log(`Digital Self listening on http://localhost:${config.port}`);
  console.log(llm
    ? `AI enabled: ${config.chatModel} + ${config.embeddingModel} (budget ${config.tokenBudget} tokens, ${config.rateLimitPerMinute}/min)`
    : config.aiPaused
      ? 'AI paused: AI_ENABLED is not true, so OpenAI is never called. The deterministic engine answers every request.'
      : 'AI disabled: OPENAI_API_KEY is not set. The deterministic engine answers every request.');
  if (config.staticDir) console.log(`Serving web app from ${config.staticDir}`);
});
