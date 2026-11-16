import type { UsageBudget } from '../budget';
import type { LlmClient } from '../llm';
import { cosine } from '../retrieval';
import type { Database } from './db';
import { getSetting, setSetting } from './db';
import { TwinEngine, REGISTER_LABEL } from './engine';
import { ACTIONS, styleProfile } from './persona';
import { styleScore, type StyleMetrics } from './style';
import { fold, hash } from './text';
import type { Relationship } from './types';
import lastAiEval from './seed/last-ai-eval.json';

/**
 * Fidelity on the hold-out set: ~12% of real (incoming → owner reply) pairs that the twin never sees
 * (excluded from style, facts and retrieval). Offline metrics are computed by our own code.
 */

export interface HoldoutItem {
  id: string; incoming: string; real: string; register: Relationship; contact: string; platform: string;
  twin: string; twinEngine: string; baseline: string;
  styleFit: { real: number; twin: number; baseline: number };
  lexical: { twin: number; baseline: number };
  exact: boolean;
  /** Same decision as the real reply (declines / accepts / asks for details / proposes another time). */
  decision: { real: string; twin: string; baseline: string };
  blindRegister: { real: Relationship; twin: Relationship; baseline: Relationship };
}

const trigrams = (text: string) => {
  const clean = ` ${fold(text).replace(/\s+/g, ' ').trim()} `;
  const grams = new Map<string, number>();
  for (let i = 0; i < clean.length - 2; i++) grams.set(clean.slice(i, i + 3), (grams.get(clean.slice(i, i + 3)) ?? 0) + 1);
  return grams;
};
/** Character-trigram cosine: a language-agnostic, offline proxy for "says the same thing the same way". */
export function lexicalSimilarity(a: string, b: string) {
  if (!a.trim() || !b.trim()) return 0;
  const left = trigrams(a), right = trigrams(b);
  let dot = 0;
  for (const [gram, count] of left) dot += count * (right.get(gram) ?? 0);
  const norm = (map: Map<string, number>) => Math.sqrt([...map.values()].reduce((sum, value) => sum + value * value, 0));
  return Number((dot / (norm(left) * norm(right) || 1)).toFixed(3));
}

/** Blind "who is this addressed to?": the register whose measured style fits the text best. */
function blindRegister(text: string, registers: Partial<Record<Relationship, StyleMetrics>>): Relationship {
  const scored = (Object.entries(registers) as Array<[Relationship, StyleMetrics]>).map(([name, metrics]) => ({ name, score: text ? styleScore(text, metrics).score : 0 }));
  return scored.sort((a, b) => b.score - a.score)[0]?.name ?? 'unknown';
}

/** The decision a reply expresses, by our own action classifier. */
export function decisionOf(text: string) {
  if (!text.trim()) return 'καμία';
  const actions = new Set(ACTIONS.filter(action => action.test(text)).map(action => action.id));
  if (actions.has('decline')) return actions.has('weekend') ? 'αρνείται · προτείνει Σαββατοκύριακο' : actions.has('morning') ? 'αρνείται · προτείνει πρωί' : 'αρνείται';
  if (actions.has('code') || actions.has('split')) return 'αναλαμβάνει τον κώδικα';
  if (actions.has('details')) return 'ζητά λεπτομέρειες';
  if (actions.has('accept')) return 'δέχεται';
  return 'άλλο';
}

const mean = (values: number[]) => (values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : 0);

export function holdoutPairs(db: Database) {
  return db.prepare(`
    SELECT m.id, r.text AS incoming, m.text AS real, t.relationship AS register, p.display_name AS contact, t.platform, r.sent_at AS sentAt
    FROM messages m JOIN messages r ON r.id = m.reply_to_message_id JOIN threads t ON t.id = m.thread_id
    JOIN participants p ON p.id = r.participant_id JOIN sources s ON s.id = m.source_id
    WHERE m.holdout = 1 AND m.is_owner = 1 AND s.included = 1 ORDER BY m.sent_at`).all() as Array<{ id: string; incoming: string; real: string; register: Relationship; contact: string; platform: string; sentAt: string }>;
}

export async function offlineFidelity(db: Database) {
  const engine = new TwinEngine(db);
  const profile = styleProfile(db);
  const registers = profile?.byRelationship ?? {};
  const items: HoldoutItem[] = [];
  for (const pair of holdoutPairs(db)) {
    const reply = await engine.reply({ incoming: pair.incoming, platform: pair.platform, relationship: pair.register, contactName: pair.contact, sentAt: pair.sentAt });
    const baseline = engine.retrieve({ incoming: pair.incoming, platform: pair.platform }, pair.register, 1, true)[0]?.reply ?? '';
    const metrics = registers[pair.register] ?? profile?.global;
    const fit = (text: string) => (metrics && text ? styleScore(text, metrics).score : 0);
    items.push({
      ...pair, twin: reply.text, twinEngine: reply.engine, baseline,
      styleFit: { real: fit(pair.real), twin: fit(reply.text), baseline: fit(baseline) },
      lexical: { twin: lexicalSimilarity(reply.text, pair.real), baseline: lexicalSimilarity(baseline, pair.real) },
      exact: fold(reply.text).trim() === fold(pair.real).trim(),
      decision: { real: decisionOf(pair.real), twin: decisionOf(reply.text), baseline: decisionOf(baseline) },
      blindRegister: { real: blindRegister(pair.real, registers), twin: blindRegister(reply.text, registers), baseline: blindRegister(baseline, registers) },
    });
  }
  const answered = items.filter(item => item.twinEngine !== 'abstain');
  const summary = (list: HoldoutItem[]) => ({
    n: list.length,
    twin: { styleFit: mean(list.map(item => item.styleFit.twin)), lexical: mean(list.map(item => item.lexical.twin)), registerAccuracy: mean(list.map(item => Number(item.blindRegister.twin === item.register))), decision: mean(list.map(item => Number(item.decision.twin === item.decision.real))) },
    baseline: { styleFit: mean(list.map(item => item.styleFit.baseline)), lexical: mean(list.map(item => item.lexical.baseline)), registerAccuracy: mean(list.map(item => Number(item.blindRegister.baseline === item.register))), decision: mean(list.map(item => Number(item.decision.baseline === item.decision.real))) },
    real: { styleFit: mean(list.map(item => item.styleFit.real)), registerAccuracy: mean(list.map(item => Number(item.blindRegister.real === item.register))) },
  });
  const byRegister = [...new Set(answered.map(item => item.register))].map(register => ({ register, label: REGISTER_LABEL[register], ...summary(answered.filter(item => item.register === register)) }));
  const feedbackEvents = (db.prepare('SELECT COUNT(*) AS n FROM feedback_events').get() as { n: number }).n;
  const result = {
    computedAt: new Date().toISOString(),
    holdout: items.length,
    abstained: items.length - answered.length,
    exact: answered.filter(item => item.exact).length,
    overall: summary(answered),
    byRegister,
    worst: [...answered].sort((a, b) => a.lexical.twin + a.styleFit.twin - (b.lexical.twin + b.styleFit.twin)).slice(0, 4),
    items,
    feedbackEvents,
  };
  // Learning-loop timeline: one point per change in the amount of owner feedback.
  const history = getSetting<Array<{ at: string; feedbackEvents: number; styleFit: number; lexical: number }>>(db, 'fidelity_history', []);
  if (!history.length || history.at(-1)!.feedbackEvents !== feedbackEvents) {
    setSetting(db, 'fidelity_history', [...history, { at: result.computedAt, feedbackEvents, styleFit: result.overall.twin.styleFit, lexical: result.overall.twin.lexical }].slice(-50));
  }
  return { ...result, history: getSetting(db, 'fidelity_history', []), lastAiEval, aiRun: getSetting(db, 'fidelity_ai_run', null) };
}

// ---------- blind test: "which one did I write?" ----------
export async function blindPairs(db: Database) {
  const engine = new TwinEngine(db);
  const pairs = [];
  for (const pair of holdoutPairs(db)) {
    const reply = await engine.reply({ incoming: pair.incoming, platform: pair.platform, relationship: pair.register, contactName: pair.contact, sentAt: pair.sentAt });
    // Identical or empty twin replies make no sense in a blind test.
    if (!reply.text || fold(reply.text).trim() === fold(pair.real).trim()) continue;
    const realFirst = parseInt(hash('blind', pair.id).slice(0, 2), 16) % 2 === 0;
    pairs.push({ id: pair.id, incoming: pair.incoming, contact: pair.contact, platform: pair.platform, options: realFirst ? [pair.real, reply.text] : [reply.text, pair.real] });
  }
  const results = getSetting<Array<{ id: string; correct: boolean }>>(db, 'blind_results', []);
  return { pairs, results: blindSummary(results) };
}

const blindSummary = (results: Array<{ id: string; correct: boolean }>) => ({ answered: results.length, fooled: results.filter(result => !result.correct).length, confusion: results.length ? Number((results.filter(result => !result.correct).length / results.length).toFixed(2)) : null });

export async function answerBlind(db: Database, id: string, choice: number) {
  const pair = (await blindPairs(db)).pairs.find(item => item.id === id);
  if (!pair) return null;
  const real = (db.prepare('SELECT text FROM messages WHERE id = ?').get(id) as { text: string }).text;
  const correct = pair.options[choice] === real;
  const results = getSetting<Array<{ id: string; correct: boolean }>>(db, 'blind_results', []).filter(result => result.id !== id);
  results.push({ id, correct });
  setSetting(db, 'blind_results', results);
  return { correct, real, summary: blindSummary(results) };
}

// ---------- AI run (only when AI is enabled): embeddings + LLM-as-judge with a fixed rubric ----------
const JUDGE_SCHEMA = { name: 'fidelity_judge', schema: { type: 'object', additionalProperties: false, required: ['intentMatch', 'toneMatch', 'friendWouldNotice', 'reasoning'], properties: {
  intentMatch: { type: 'integer', description: '0–5: does the candidate decide/say the same thing as the real reply?' },
  toneMatch: { type: 'integer', description: '0–5: same register, length, punctuation, emoji habits?' },
  friendWouldNotice: { type: 'boolean', description: 'Would a close friend notice it was not written by the person?' },
  reasoning: { type: 'string' },
} } };

export async function aiFidelityRun(db: Database, llm: LlmClient, budget: UsageBudget, limit = 12) {
  const engine = new TwinEngine(db, llm, budget);
  const items = [];
  for (const pair of holdoutPairs(db).slice(0, limit)) {
    const twin = await engine.reply({ incoming: pair.incoming, platform: pair.platform, relationship: pair.register, contactName: pair.contact, sentAt: pair.sentAt });
    const generic = (await engine.generic(pair.incoming)) ?? '';
    const texts = [pair.real, twin.text || ' ', generic || ' '].map(text => engine.redactForModel(text));
    if (budget.acquire()) throw new Error('budget');
    const { vectors, usage } = await llm.embed(texts);
    budget.record(usage.totalTokens);
    const judge = async (candidate: string) => {
      if (!candidate.trim() || budget.acquire()) return null;
      const { data, usage: judged } = await llm.chatJson<{ intentMatch: number; toneMatch: number; friendWouldNotice: boolean; reasoning: string }>({
        system: 'You compare a candidate reply with the reply a person really sent. Score strictly with the rubric. Answer in Greek.',
        user: engine.redactForModel(`Incoming: «${pair.incoming}»\nReal reply: «${pair.real}»\nCandidate: «${candidate}»`), schema: JUDGE_SCHEMA, maxTokens: 600,
      });
      budget.record(judged.totalTokens);
      return data;
    };
    items.push({
      id: pair.id, register: pair.register, incoming: pair.incoming, real: pair.real, twin: twin.text, twinEngine: twin.engine, generic,
      semantic: { twin: Number(cosine(vectors[0], vectors[1]).toFixed(3)), generic: Number(cosine(vectors[0], vectors[2]).toFixed(3)) },
      judge: { twin: await judge(twin.text), generic: await judge(generic) },
    });
  }
  const avg = (values: Array<number | undefined>) => mean(values.filter((value): value is number => typeof value === 'number'));
  const run = {
    ranAt: new Date().toISOString(), model: llm.chatModel, n: items.length,
    twin: { semantic: avg(items.map(item => item.semantic.twin)), intent: avg(items.map(item => item.judge.twin?.intentMatch)), tone: avg(items.map(item => item.judge.twin?.toneMatch)), noticed: avg(items.map(item => (item.judge.twin ? Number(item.judge.twin.friendWouldNotice) : undefined))) },
    generic: { semantic: avg(items.map(item => item.semantic.generic)), intent: avg(items.map(item => item.judge.generic?.intentMatch)), tone: avg(items.map(item => item.judge.generic?.toneMatch)), noticed: avg(items.map(item => (item.judge.generic ? Number(item.judge.generic.friendWouldNotice) : undefined))) },
    items,
  };
  setSetting(db, 'fidelity_ai_run', run);
  return run;
}
