/**
 * Fidelity evaluation: "does the twin write like the owner, to this person?"
 *
 * Leave-one-out over the owner's writing samples. For each held-out sample the twin sees the contact's
 * message but NOT the owner's real reply (the sample is hidden from the repository and from retrieval).
 * Its reply is compared with the real one and with two baselines:
 *   - generic: the same model with no persona, style or samples;
 *   - rules:   the deterministic engine shipped for offline use.
 *
 * Metrics
 *   style similarity   cosine(embedding(reply), embedding(real owner reply)), text-embedding-3-large
 *   relationship acc.  is the reply closest to the owner's style centroid for the right relationship
 *                      (friend / classmate / professor)? A blind "who is this addressed to" test.
 *   register           professor replies with no emoji and the formal plural; friend replies without it
 *
 * Usage: OPENAI_API_KEY=... npm run eval   (EVAL_PER_CONTACT=3 by default → 18 held-out samples)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MockSourceRepository } from '../src/domain/SourceRepository';
import type { Relationship, SourceRepository, SourceSample } from '../src/domain/types';
import { UsageBudget } from './budget';
import { loadConfig } from './config';
import { OpenAiLlmClient } from './llm';
import { cosine } from './retrieval';
import { SuggestionService } from './suggestionService';

const config = loadConfig();
if (!config.openaiApiKey) {
  console.error('OPENAI_API_KEY is required for the evaluation.');
  process.exit(1);
}
const perContact = Number(process.env.EVAL_PER_CONTACT) || 3;
const base = new MockSourceRepository();

/** Repository that hides one sample, so the twin cannot copy the answer it is graded on. */
class HoldOutRepository implements SourceRepository {
  hidden = '';
  getPersona() { return base.getPersona(); }
  getContacts(channel?: SourceSample['channel']) { return base.getContacts(channel); }
  getContact(id: string) { return base.getContact(id); }
  getThreads(channel?: SourceSample['channel']) { return base.getThreads(channel); }
  getSources(contactId: string) { return base.getSources(contactId).filter(sample => sample.id !== this.hidden); }
  getSource(id: string) { return id === this.hidden ? undefined : base.getSource(id); }
}

const repository = new HoldOutRepository();
const budget = new UsageBudget(config.tokenBudget, 1000);
const llm = new OpenAiLlmClient(config);
const twin = new SuggestionService({ repository, llm, budget });
const offline = new SuggestionService({ repository, budget });

const contacts = base.getContacts();
const allSamples = contacts.flatMap(contact => base.getSources(contact.id));
const heldOut = contacts.flatMap(contact => base.getSources(contact.id).slice(0, perContact));
const relationshipOf = (sample: SourceSample) => base.getContact(sample.contactId)!.relationship;

const EMOJI = /\p{Extended_Pictographic}/u;
const FORMAL = /(σας|σάς|θα μπορούσατε|ευχαριστώ για το μήνυμά σας)/i;
function registerOk(text: string, relationship: Relationship) {
  if (relationship === 'professor') return !EMOJI.test(text) && FORMAL.test(text);
  if (relationship === 'friend') return !/θα μπορούσατε|αξιότιμ/i.test(text);
  return true;
}

async function embedAll(texts: string[]) {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const { vectors: chunk, usage } = await llm.embed(texts.slice(i, i + 64));
    budget.record(usage.totalTokens);
    vectors.push(...chunk);
  }
  return vectors;
}

async function genericReply(message: string) {
  const { data, usage } = await llm.chatJson<{ reply: string }>({
    system: 'You are a helpful assistant. Write a short reply in Greek to the message below.',
    user: message,
    schema: { name: 'generic_reply', schema: { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } } },
    maxTokens: 800,
  });
  budget.record(usage.totalTokens);
  return data.reply.trim();
}

interface Row { sample: SourceSample; relationship: Relationship; twin: string; engine: string; generic: string; rules: string; latencyMs: number }

const rows: Row[] = [];
for (const sample of heldOut) {
  repository.hidden = sample.id;
  const contact = base.getContact(sample.contactId)!;
  const message = { id: `eval-${sample.id}`, author: 'contact' as const, text: sample.contactText, time: '12:00' };
  const request = { mode: 'reply' as const, channel: contact.channel, contactId: contact.id, history: [message], draft: '' };
  const started = Date.now();
  const [twinResult, rulesResult, generic] = await Promise.all([twin.suggest(request), offline.suggest(request), genericReply(sample.contactText)]);
  rows.push({
    sample, relationship: contact.relationship,
    twin: twinResult?.text ?? '', engine: twinResult?.meta?.engine ?? 'none', latencyMs: Date.now() - started,
    generic, rules: rulesResult?.text ?? '',
  });
  process.stdout.write(`${sample.id}: ${twinResult?.meta?.engine} · ${twinResult?.text}\n`);
}

// Relationship centroids from owner samples, excluding each held-out sample when it is graded.
const sampleVectors = await embedAll(allSamples.map(sample => sample.ownerText));
const vectorOf = new Map(allSamples.map((sample, index) => [sample.id, sampleVectors[index]]));
function centroid(relationship: Relationship, exclude: string) {
  const members = allSamples.filter(sample => relationshipOf(sample) === relationship && sample.id !== exclude).map(sample => vectorOf.get(sample.id)!);
  return members[0].map((_, dim) => members.reduce((sum, vector) => sum + vector[dim], 0) / members.length);
}
const relationships: Relationship[] = ['friend', 'classmate', 'professor'];
const outputs = await embedAll(rows.flatMap(row => [row.twin || ' ', row.generic || ' ', row.rules || ' ']));

type System = 'twin' | 'generic' | 'rules';
const systems: System[] = ['twin', 'generic', 'rules'];
const score = Object.fromEntries(systems.map(system => [system, { similarity: 0, relationship: 0, register: 0 }])) as Record<System, { similarity: number; relationship: number; register: number }>;
const perRelationship: Record<string, Record<System, number>> = {};

rows.forEach((row, index) => {
  const truth = vectorOf.get(row.sample.id)!;
  const centroids = relationships.map(relationship => ({ relationship, vector: centroid(relationship, row.sample.id) }));
  systems.forEach((system, offset) => {
    const vector = outputs[index * 3 + offset];
    const similarity = cosine(vector, truth);
    const predicted = centroids.map(item => ({ ...item, score: cosine(vector, item.vector) })).sort((a, b) => b.score - a.score)[0].relationship;
    score[system].similarity += similarity;
    score[system].relationship += predicted === row.relationship ? 1 : 0;
    score[system].register += registerOk(row[system], row.relationship) ? 1 : 0;
    perRelationship[row.relationship] ??= { twin: 0, generic: 0, rules: 0 };
    perRelationship[row.relationship][system] += similarity;
  });
});

const n = rows.length;
const pct = (value: number) => `${Math.round((value / n) * 100)}%`;
const label: Record<System, string> = { twin: `Digital Self (${config.chatModel} + retrieval)`, generic: `Generic ${config.chatModel}, no persona`, rules: 'Deterministic rules (offline)' };
const counts = Object.fromEntries(relationships.map(relationship => [relationship, rows.filter(row => row.relationship === relationship).length]));
const fallbacks = rows.filter(row => row.engine !== 'openai').length;
const escape = (text: string) => text.replace(/\|/g, '\\|').replace(/\n+/g, ' ⏎ ');

const report = `# Fidelity evaluation

Generated ${new Date().toISOString()} with \`npm run eval\` · chat model \`${config.chatModel}\` · embeddings \`${config.embeddingModel}\` · ${n} held-out samples (${perContact} per contact) · ${budget.snapshot().tokensSpent.toLocaleString('en')} tokens.

**Method.** Leave-one-out over the owner's synthetic writing samples. For each held-out sample the twin receives only the contact's message; the owner's real reply is hidden from the repository and from retrieval. The reply is compared with the real owner reply.

- **Style similarity**: cosine similarity between the reply and the real owner reply (\`${config.embeddingModel}\`). Higher is closer.
- **Relationship accuracy**: a blind test. Without being told the recipient, is the reply closest to the owner's style for the correct relationship (friend / classmate / professor)? Chance is 33%.
- **Register**: replies to the professor use the formal plural and no emoji; replies to a friend avoid formal phrasing.

| System | Style similarity | Relationship accuracy | Register |
|---|---:|---:|---:|
${systems.map(system => `| ${label[system]} | ${(score[system].similarity / n).toFixed(3)} | ${pct(score[system].relationship)} | ${pct(score[system].register)} |`).join('\n')}

Style similarity by relationship:

| Relationship | n | Digital Self | Generic | Rules |
|---|---:|---:|---:|---:|
${relationships.map(relationship => `| ${relationship} | ${counts[relationship]} | ${(perRelationship[relationship].twin / counts[relationship]).toFixed(3)} | ${(perRelationship[relationship].generic / counts[relationship]).toFixed(3)} | ${(perRelationship[relationship].rules / counts[relationship]).toFixed(3)} |`).join('\n')}

Model replies replaced by the deterministic engine (guard or error): ${fallbacks} of ${n}. Mean latency per held-out sample (three systems in parallel): ${(rows.reduce((sum, row) => sum + row.latencyMs, 0) / n / 1000).toFixed(1)} s.

**Caveats.** The samples are synthetic and few (9 per contact), so the numbers show the direction, not a benchmark. The deterministic engine was written with these same samples in view, so its similarity is optimistic. Real fidelity must be re-measured on the owner's own consented data.

## Replies

| Sample | To | Contact wrote | Real owner reply | Digital Self | Generic |
|---|---|---|---|---|---|
${rows.map(row => `| \`${row.sample.id}\` | ${row.relationship} | ${escape(row.sample.contactText)} | ${escape(row.sample.ownerText)} | ${escape(row.twin)} | ${escape(row.generic)} |`).join('\n')}
`;

const target = path.resolve(process.cwd(), '..', 'docs', 'EVALUATION.md');
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, report);
console.log(`\n${systems.map(system => `${system}: similarity ${(score[system].similarity / n).toFixed(3)}, relationship ${pct(score[system].relationship)}, register ${pct(score[system].register)}`).join('\n')}`);
console.log(`Report written to ${target}`);
