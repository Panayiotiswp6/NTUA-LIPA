import type { UsageBudget } from '../budget';
import type { LlmClient } from '../llm';
import type { Database } from './db';
import type { TwinEngine } from './engine';
import { listFacts } from './persona';
import { fold, words } from './text';

export interface AskAnswer {
  answer: string;
  /** Fact ids ("f_…"), message ids ("m_…") or document ids ("d_…") that support the answer. */
  citations: Array<{ id: string; text: string }>;
  confidence: number;
  engine: 'twin-llm' | 'offline-twin' | 'abstain';
  abstained: boolean;
  mode: 'as_owner' | 'about_owner';
}

const STOP = new Set(['τι', 'θα', 'να', 'το', 'τη', 'την', 'και', 'μου', 'σου', 'αν', 'ενα', 'μια', 'για', 'με', 'σε', 'στο', 'ξερω', 'ξερεισ', 'εγω', 'εμενα', 'πωσ', 'ποιο', 'ποια', 'ειμαι', 'κανω', 'απο']);
const tokens = (text: string) => words(text).filter(token => token.length > 2 && !STOP.has(token));
/** «Τι θα έλεγα αν ένας συνάδελφος μου ζητούσε…» → answer AS the owner by simulating the incoming message. */
const AS_OWNER = /^\s*(τι|πώς|πως)\s+(θα\s+)?(έλεγα|απαντούσα|απαντουσα|ελεγα|θα πω|θα απαντήσω)/i;

export async function askTwin(db: Database, engine: TwinEngine, question: string, llm?: LlmClient, budget?: UsageBudget): Promise<AskAnswer> {
  if (AS_OWNER.test(question)) {
    const scenario = question.replace(AS_OWNER, '').replace(/^\s*(αν|εάν|σε)\s+/i, '').replace(/\?$/, '').trim();
    const quoted = /[«"“](.+?)[»"”]/.exec(question)?.[1];
    const reply = await engine.reply({ incoming: quoted ?? scenario, platform: /email|mail|καθηγ|συνάδελφ|εταιρ/i.test(question) ? 'gmail' : 'whatsapp', relationship: /συνάδελφ|καθηγ|εταιρ|προϊστάμεν|αφεντικ/i.test(question) ? 'work' : /μαμά|μπαμπά/i.test(question) ? 'family' : undefined });
    return {
      mode: 'as_owner',
      answer: reply.abstained ? reply.rationale : `Θα έλεγες: «${reply.text}»\n\n${reply.rationale}`,
      citations: [...reply.facts.map(fact => ({ id: fact.id, text: fact.statement })), ...reply.exemplars.slice(0, 3).map(item => ({ id: item.id, text: `«${item.incoming}» → «${item.reply}»` }))],
      confidence: reply.confidence, engine: reply.engine === 'abstain' ? 'abstain' : reply.engine, abstained: reply.abstained,
    };
  }

  // About the owner: knowledge, preferences, habits, decisions, with citations.
  const query = new Set(tokens(question));
  const facts = listFacts(db).filter(fact => fact.status !== 'rejected')
    .map(fact => ({ fact, overlap: tokens(fact.statement).filter(token => query.has(token) || [...query].some(item => item.length > 4 && token.startsWith(item.slice(0, -2)))).length }))
    .filter(item => item.overlap > 0).sort((a, b) => b.overlap - a.overlap || b.fact.confidence - a.fact.confidence).slice(0, 5);
  const documents = (db.prepare('SELECT d.id, d.title, d.text_redacted AS text FROM documents d JOIN sources s ON s.id = d.source_id WHERE s.included = 1').all() as Array<{ id: string; title: string; text: string }>)
    .flatMap(document => document.text.split('\n').filter(line => tokens(line).some(token => query.has(token))).map(line => ({ id: document.id, text: `${document.title}: ${line.replace(/^[-*#\d.\s]+/, '')}` }))).slice(0, 4);

  if (llm && budget && !budget.acquire() && (facts.length || documents.length)) {
    const context = [...facts.map(item => `[${item.fact.id}] ${item.fact.statement}`), ...documents.map(item => `[${item.id}] ${item.text}`)].join('\n');
    const { data, usage } = await llm.chatJson<{ answer: string; citations: string[]; confidence: number; abstain: boolean }>({
      system: 'Answer a question about the owner, in Greek, using ONLY the facts and notes given. Cite the ids you used. If they do not answer the question, set abstain=true. Never invent.',
      user: engine.redactForModel(`Facts and notes:\n${context}\n\nQuestion: ${question}`), maxTokens: 900,
      schema: { name: 'ask_answer', schema: { type: 'object', additionalProperties: false, required: ['answer', 'citations', 'confidence', 'abstain'], properties: { answer: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' }, abstain: { type: 'boolean' } } } },
    });
    budget.record(usage.totalTokens);
    const known = new Map([...facts.map(item => [item.fact.id, item.fact.statement] as const), ...documents.map(item => [item.id, item.text] as const)]);
    const citations = data.citations.filter(id => known.has(id)).map(id => ({ id, text: known.get(id)! }));
    if (!data.abstain && citations.length) return { mode: 'about_owner', answer: engine.depseudonymize(data.answer), citations, confidence: Number(Math.min(1, data.confidence).toFixed(2)), engine: 'twin-llm', abstained: false };
  }

  if (!facts.length && !documents.length) {
    return { mode: 'about_owner', answer: 'Δεν ξέρω — δεν βρίσκω κάτι σχετικό στα δεδομένα σου, οπότε δεν μαντεύω.', citations: [], confidence: 0, engine: 'abstain', abstained: true };
  }
  const lines = [...facts.map(item => item.fact.statement), ...documents.filter(item => !facts.some(fact => fold(fact.fact.statement).includes(fold(item.text.split(': ').slice(1).join(': ')).slice(0, 30)))).map(item => item.text)];
  return {
    mode: 'about_owner',
    answer: `Από όσα ξέρω για σένα:\n${lines.slice(0, 5).map(line => `• ${line}`).join('\n')}`,
    citations: [...facts.map(item => ({ id: item.fact.id, text: item.fact.statement })), ...documents],
    confidence: Number(Math.min(0.9, 0.35 + 0.15 * (facts[0]?.overlap ?? 1)).toFixed(2)),
    engine: 'offline-twin', abstained: false,
  };
}
