import { availabilityReply } from '../../src/domain/availabilityReply';
import { resolveAvailability } from '../../src/domain/schedule';
import { DEFAULT_REFERENCE_DATE, initialScheduleEvents } from '../../src/domain/scheduleData';
import type { AvailabilityResult } from '../../src/domain/scheduleTypes';
import type { Contact, Relationship as DemoRelationship } from '../../src/domain/types';
import type { UsageBudget } from '../budget';
import { guardReply } from '../guard';
import type { LlmClient } from '../llm';
import type { Database } from './db';
import { getSetting } from './db';
import { listFacts, SITUATIONS, styleProfile, type PersonaFact } from './persona';
import { styleScore, type StyleMetrics, type StyleScore } from './style';
import { redact } from './redact';
import { fold, words } from './text';
import type { Relationship } from './types';

export type Engine = 'twin-llm' | 'offline-twin' | 'abstain';

export interface TwinRequest {
  incoming: string;
  platform: string;
  relationship?: Relationship;
  /** The contact's name, used to prefer exemplars from the same person. */
  contactName?: string;
  history?: Array<{ author: 'owner' | 'contact'; text: string }>;
  /** Local time the message arrived; decides "weekday / evening" situations. */
  sentAt?: string;
}

export interface Exemplar {
  id: string; incoming: string; reply: string; platform: string; relationship: Relationship; contact: string; score: number; source: 'history' | 'feedback';
  /** Share of the new message's meaningful words that the past message also had. */
  coverage: number;
  /** Both messages are the same kind of situation (e.g. a last-minute weekday invitation). */
  sameSituation: boolean;
}

export interface TwinReply {
  text: string;
  engine: Engine;
  register: Relationship;
  confidence: number;
  rationale: string;
  situations: string[];
  exemplars: Exemplar[];
  facts: Array<Pick<PersonaFact, 'id' | 'category' | 'statement' | 'confidence'>>;
  style: StyleScore;
  availability?: AvailabilityResult;
  abstained: boolean;
  model?: string;
  notes: string[];
}

const STOP = new Set(['και', 'να', 'το', 'τη', 'την', 'τον', 'του', 'της', 'σε', 'στο', 'στη', 'στην', 'με', 'για', 'απο', 'που', 'θα', 'ειναι', 'ο', 'η', 'οι', 'τα', 'μου', 'σου', 'ενα', 'μια', 'αν', 'οτι', 'na', 'to', 'kai', 'σασ', 'εσυ']);
const tokens = (text: string) => words(text).filter(token => token.length > 1 && !STOP.has(token));
/** Words that make two messages look alike without meaning the same thing. */
const GENERIC = /^(καλημερα|καλησπερα|γεια|εκτιμηση|αγαπητ\S*|ευχαριστω|δευτερα|τριτη|τεταρτη|πεμπτη|παρασκευη|σαββατο|κυριακη|σημερα|αυριο|αποψε|βραδυ|πρωι|ωρα|τωρα|re|ela)$/;
const FORMAL = /(σας|σάς|θα μπορούσατε|με εκτίμηση|αξιότιμ|κύριε|κυρία|καλησπέρα σας|καλημέρα σας)/i;
const STUDY = /(εργασ|μάθημα|άσκηση|ερώτημα|εξετα|εργαστήρ|προθεσμ|repo|κώδικ)/i;
const FAMILY = /(μαμά|μπαμπά|γιαγιά|παππού|έφαγες|φαγητό την κυριακή)/i;

export const RELATIONSHIP_TO_DEMO: Record<Relationship, DemoRelationship> = { friend: 'friend', family: 'friend', study: 'classmate', work: 'professor', unknown: 'classmate' };
export const REGISTER_LABEL: Record<Relationship, string> = { friend: 'φίλος/η', family: 'οικογένεια', study: 'σπουδές', work: 'επίσημο', unknown: 'άγνωστο' };

export function inferRegister(request: TwinRequest): Relationship {
  if (request.relationship && request.relationship !== 'unknown') return request.relationship;
  if (FORMAL.test(request.incoming) || request.platform === 'gmail') return FORMAL.test(request.incoming) || /^(καλημέρα|καλησπέρα|αγαπητ)/i.test(request.incoming.trim()) ? 'work' : 'study';
  if (FAMILY.test(request.incoming)) return 'family';
  if (STUDY.test(request.incoming)) return 'study';
  return 'friend';
}

export function situationsOf(text: string, sentAt: string) {
  return SITUATIONS.filter(situation => situation.test(text, sentAt)).map(situation => situation.id);
}

interface Corpus { pairs: Array<Omit<Exemplar, 'score' | 'coverage' | 'sameSituation'> & { tokens: string[]; sentAt: string; situations: string[] }>; df: Map<string, number>; replyDf: Map<string, number>; avgLength: number; version: string }

/** Situational memory: past (incoming → owner reply) pairs and approved/edited drafts, never hold-out pairs. */
export class TwinEngine {
  private corpus?: Corpus;

  constructor(private readonly db: Database, private readonly llm?: LlmClient, private readonly budget?: UsageBudget) {}

  invalidate() { this.corpus = undefined; }

  private load(): Corpus {
    if (this.corpus) return this.corpus;
    const rows = this.db.prepare(`
      SELECT m.id, r.text AS incoming, m.text AS reply, r.sent_at AS sentAt, t.platform, t.relationship, p.display_name AS contact
      FROM messages m
      JOIN messages r ON r.id = m.reply_to_message_id
      JOIN threads t ON t.id = m.thread_id
      JOIN sources s ON s.id = m.source_id
      JOIN participants p ON p.id = r.participant_id
      WHERE m.is_owner = 1 AND m.holdout = 0 AND s.included = 1`).all() as Array<{ id: string; incoming: string; reply: string; sentAt: string; platform: string; relationship: Relationship; contact: string }>;
    // The owner's edits in Reply Studio are the strongest evidence of how they actually write.
    const feedback = this.db.prepare("SELECT id, incoming, final_text AS reply, created_at AS sentAt, platform, COALESCE(relationship, 'unknown') AS relationship FROM feedback_events WHERE action IN ('accepted', 'edited') AND final_text != ''").all() as Array<{ id: number; incoming: string; reply: string; sentAt: string; platform: string; relationship: Relationship }>;
    const pairs = [
      ...rows.map(row => ({ ...row, source: 'history' as const })),
      ...feedback.map(row => ({ ...row, id: `fb_${row.id}`, contact: '', sentAt: row.sentAt.slice(0, 19), source: 'feedback' as const })),
    ].map(pair => ({ ...pair, tokens: tokens(pair.incoming), situations: situationsOf(pair.incoming, pair.sentAt) }));
    const df = new Map<string, number>();
    for (const pair of pairs) for (const token of new Set(pair.tokens)) df.set(token, (df.get(token) ?? 0) + 1);
    const replyDf = new Map<string, number>();
    for (const pair of pairs) for (const token of new Set(tokens(pair.reply))) replyDf.set(token, (replyDf.get(token) ?? 0) + 1);
    this.corpus = { pairs, df, replyDf, avgLength: pairs.reduce((sum, pair) => sum + pair.tokens.length, 0) / Math.max(1, pairs.length), version: '' };
    return this.corpus;
  }

  /** BM25 on the incoming side, plus situation, register, same-person and owner-feedback boosts. */
  retrieve(request: TwinRequest, register: Relationship, limit = 5): Exemplar[] {
    const corpus = this.load();
    const query = tokens(request.incoming);
    const names = new Set(this.db.prepare('SELECT display_name AS name FROM participants').all().flatMap(row => tokens((row as { name: string }).name)));
    // Names inflect (Αλέξανδρος → Αλέξανδρε), so compare stems.
    const isName = (token: string) => [...names].some(name => name.length > 3 && token.slice(0, 5) === name.slice(0, 5));
    const meaningful = [...new Set(query)].filter(token => !GENERIC.test(token) && !isName(token));
    const sentAt = request.sentAt ?? `${DEFAULT_REFERENCE_DATE}T12:00:00`;
    const situations = new Set(situationsOf(request.incoming, sentAt));
    const n = corpus.pairs.length;
    const scored = corpus.pairs.map(pair => {
      let score = 0;
      const counts = new Map<string, number>();
      for (const token of pair.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      for (const token of new Set(query)) {
        const tf = counts.get(token);
        if (!tf) continue;
        const idf = Math.log(1 + (n - (corpus.df.get(token) ?? 0) + 0.5) / ((corpus.df.get(token) ?? 0) + 0.5));
        const weight = GENERIC.test(token) || isName(token) ? 0.3 : 1;
        score += weight * idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * pair.tokens.length / Math.max(1, corpus.avgLength)));
      }
      const sameSituation = pair.situations.some(situation => situations.has(situation));
      if (sameSituation) score += 4;
      if (pair.relationship === register) score += 1.2;
      if (request.contactName && fold(pair.contact) === fold(request.contactName)) score += 1;
      if (pair.platform === request.platform) score += 0.3;
      if (pair.source === 'feedback') score *= 1.5;
      const own = new Set(pair.tokens);
      const coverage = meaningful.length ? meaningful.filter(token => own.has(token)).length / meaningful.length : 0;
      return { pair, score, coverage, sameSituation };
    }).filter(item => item.score > 1.5).sort((a, b) => b.score - a.score);
    // Prefer the register; fall back to other registers only when it has nothing relevant.
    const inRegister = scored.filter(item => item.pair.relationship === register);
    const chosen = (inRegister.length >= 2 ? inRegister : scored).slice(0, limit);
    return chosen.map(({ pair, score, coverage, sameSituation }) => ({ id: pair.id, incoming: pair.incoming, reply: pair.reply, platform: pair.platform, relationship: pair.relationship, contact: pair.contact, source: pair.source, score: Number(score.toFixed(2)), coverage: Number(coverage.toFixed(2)), sameSituation }));
  }

  relevantFacts(request: TwinRequest, situations: string[]) {
    const facts = listFacts(this.db).filter(fact => fact.status !== 'rejected');
    const query = new Set(tokens(request.incoming));
    const situationFacts = facts.filter(fact => situations.some(situation => fact.statement.startsWith(SITUATIONS.find(item => item.id === situation)!.label)));
    const contactFacts = request.contactName ? facts.filter(fact => fact.category === 'relationship' && fold(fact.statement).startsWith(fold(request.contactName!))) : [];
    const lexical = facts.filter(fact => fact.category !== 'relationship' && tokens(fact.statement).filter(token => query.has(token)).length >= 1)
      .sort((a, b) => tokens(b.statement).filter(token => query.has(token)).length - tokens(a.statement).filter(token => query.has(token)).length);
    const unique = new Map([...situationFacts, ...contactFacts, ...lexical].map(fact => [fact.id, fact]));
    return [...unique.values()].slice(0, 6);
  }

  private metrics(register: Relationship): StyleMetrics | undefined {
    const profile = styleProfile(this.db);
    return profile?.byRelationship[register] ?? profile?.global;
  }

  private availability(request: TwinRequest): AvailabilityResult | undefined {
    const result = resolveAvailability(request.incoming, (request.sentAt ?? DEFAULT_REFERENCE_DATE).slice(0, 10), initialScheduleEvents, 60);
    // Only a real conflict (or a possible one) overrides how the owner usually decides.
    return result.status === 'conflict' || result.status === 'tentative' ? result : undefined;
  }

  /** Everything sent to a model goes through this: other people's names become pseudonyms, PII is removed. */
  redactForModel(text: string) {
    const people = this.db.prepare('SELECT display_name AS name, pseudonym FROM participants WHERE is_owner = 0').all() as Array<{ name: string; pseudonym: string }>;
    const names = people.flatMap(person => {
      const first = person.name.split(/\s+/)[0];
      return [{ name: person.name, pseudonym: person.pseudonym }, ...(first.length >= 3 && first !== person.name ? [{ name: first, pseudonym: person.pseudonym }] : [])];
    });
    return redact(text, { names }).text;
  }

  /** Local names come back after the model, which only ever sees pseudonyms. */
  depseudonymize(text: string) {
    const people = this.db.prepare('SELECT display_name AS name, pseudonym FROM participants WHERE is_owner = 0').all() as Array<{ name: string; pseudonym: string }>;
    return people.reduce((result, person) => result.replace(new RegExp(`\\b${person.pseudonym}\\b`, 'g'), person.name.split(' ')[0]), text);
  }

  async reply(request: TwinRequest): Promise<TwinReply> {
    const register = inferRegister(request);
    const sentAt = request.sentAt ?? `${DEFAULT_REFERENCE_DATE}T12:00:00`;
    const situations = situationsOf(request.incoming, sentAt);
    const exemplars = this.retrieve(request, register);
    const facts = this.relevantFacts(request, situations).map(({ id, category, statement, confidence }) => ({ id, category, statement, confidence }));
    const metrics = this.metrics(register);
    const availability = this.availability(request);
    const base = { register, situations, exemplars, facts, availability };

    if (this.llm && this.budget && !this.budget.acquire()) {
      try {
        const generated = await this.generate(request, register, exemplars, facts, metrics, availability);
        if (generated) return { ...base, ...generated };
      } catch {
        // Fall through to the offline twin; the UI shows which engine answered.
      }
    }
    return { ...base, ...this.offline(request, register, exemplars, facts, metrics, availability) };
  }

  /** Offline twin: the owner's own words from the most similar past situation, or the calendar decision. */
  private offline(request: TwinRequest, register: Relationship, exemplars: Exemplar[], facts: TwinReply['facts'], metrics?: StyleMetrics, availability?: AvailabilityResult) {
    const notes: string[] = [];
    if (availability) {
      const contact = { relationship: RELATIONSHIP_TO_DEMO[register] } as Contact;
      const text = availabilityReply({ channel: 'instagram', contact, history: [], lastIncoming: { id: 'x', author: 'contact', text: request.incoming, time: '' }, draft: '', sources: [] }, availability);
      return {
        text, engine: 'offline-twin' as Engine, confidence: 0.8, abstained: false, notes,
        style: metrics ? styleScore(text, metrics) : { score: 0.5, notes: [] },
        rationale: `Το ημερολόγιο αποφασίζει: ${availability.reason} Η διατύπωση ακολουθεί το ύφος «${REGISTER_LABEL[register]}».`,
      };
    }
    // Reuse the owner's words only for the same kind of situation or a clearly similar message; otherwise abstain.
    const similar = exemplars.find(item => item.coverage >= 0.5);
    // Same situation but different details: take the owner's most generic wording for it, so no stale specifics
    // (a place, a time) leak into the new conversation.
    const corpus = this.load();
    const genericity = (reply: string) => { const list = tokens(reply); return list.length ? list.reduce((sum, token) => sum + Math.log(1 + (corpus.replyDf.get(token) ?? 0)), 0) / list.length : 0; };
    const situational = this.retrieve(request, register, 30).filter(item => item.sameSituation).sort((a, b) => genericity(b.reply) - genericity(a.reply))[0];
    const best = similar ?? situational;
    if (!best) {
      return {
        text: '', engine: 'abstain' as Engine, confidence: Number(Math.max(0, ...exemplars.map(item => item.coverage)).toFixed(2)), abstained: true, notes,
        style: { score: 0, notes: [] },
        rationale: 'Δεν ξέρω τι θα έλεγες εδώ: δεν βρέθηκε αρκετά παρόμοια περίπτωση στο ιστορικό σου και δεν θέλω να επινοήσω. Ενεργοποίησε το AI για νέες διατυπώσεις.',
      };
    }
    const decision = facts.find(fact => fact.category === 'decision_pattern');
    const text = best.reply;
    return {
      text, engine: 'offline-twin' as Engine, abstained: false, notes,
      confidence: Number(Math.min(0.9, best.score / (best.score + 4)).toFixed(2)),
      style: metrics ? styleScore(text, metrics) : { score: 0.5, notes: [] },
      rationale: `Ύφος «${REGISTER_LABEL[register]}». Παρόμοια περίπτωση${best.contact ? ` με ${best.contact}` : ''}: «${best.incoming.slice(0, 80)}» — απάντησες με τα ίδια λόγια.${decision ? ` Συμφωνεί με τον τρόπο που αποφασίζεις: ${decision.statement}` : ''}`,
    };
  }

  private async generate(request: TwinRequest, register: Relationship, exemplars: Exemplar[], facts: TwinReply['facts'], metrics?: StyleMetrics, availability?: AvailabilityResult) {
    const llm = this.llm!;
    const redacted = new Map((this.db.prepare(`SELECT id, text_redacted FROM messages WHERE id IN (${exemplars.filter(item => item.source === 'history').map(() => '?').join(',') || "''"})`).all(...exemplars.filter(item => item.source === 'history').map(item => item.id)) as Array<{ id: string; text_redacted: string }>).map(row => [row.id, row.text_redacted]));
    const incomingRedacted = this.db.prepare(`SELECT m.id, r.text_redacted AS incoming FROM messages m JOIN messages r ON r.id = m.reply_to_message_id WHERE m.id IN (${exemplars.map(() => '?').join(',') || "''"})`).all(...exemplars.map(item => item.id)) as Array<{ id: string; incoming: string }>;
    const incomingById = new Map(incomingRedacted.map(row => [row.id, row.incoming]));
    const persona = getSetting<string[]>(this.db, 'owner_aliases', [])[0] ?? 'the owner';
    const constraints = metrics ? [
      `typical length ≈ ${metrics.avgWords} words`,
      `emoji in ${Math.round(metrics.emojiRate * 100)}% of messages${metrics.topEmojis.length ? ` (usually ${metrics.topEmojis.slice(0, 3).map(item => item.emoji).join(' ')})` : ''}`,
      `starts with a capital letter in ${Math.round(metrics.capitalizedStart * 100)}% of messages`,
      `formal plural in ${Math.round(metrics.formality * 100)}%`,
      `language: ${Object.entries(metrics.languages).map(([lang, count]) => `${lang} ${Math.round((count! / metrics.messages) * 100)}%`).join(', ')}`,
      metrics.signOffs[0] ? `usual sign-off: «${metrics.signOffs[0].phrase}»` : '',
      metrics.catchphrases.length ? `typical phrases: ${metrics.catchphrases.slice(0, 5).map(item => `«${item.phrase}»`).join(', ')}` : '',
    ].filter(Boolean) : [];
    const system = `You are the digital twin of ${persona}. Write the reply they would send, in their voice, for this register.
Rules: write only the message body. Follow the measured style constraints. Reuse the owner's own phrasing from the similar past situations when it fits. Follow the owner's decision patterns. Never invent personal facts, places, times or promises that are not in the context. If you cannot tell what the owner would say, set abstain=true and leave reply empty. Other people appear as pseudonyms (Person_A); keep them as is.${availability ? ' The calendar decision is authoritative: follow it and do not propose other times.' : ''}`;
    const user = [
      `Register: ${REGISTER_LABEL[register]} · platform: ${request.platform}`,
      constraints.length ? `Measured style of the owner in this register:\n- ${constraints.join('\n- ')}` : '',
      facts.length ? `Relevant persona facts:\n${facts.map(fact => `[${fact.id}] ${fact.statement}`).join('\n')}` : '',
      exemplars.length ? `Similar past situations (what they wrote → what the owner replied):\n${exemplars.map(item => `[${item.id}] «${incomingById.get(item.id) ?? item.incoming}» → «${redacted.get(item.id) ?? item.reply}»`).join('\n')}` : '',
      availability ? `Calendar: ${availability.status}. ${availability.reason}` : '',
      request.history?.length ? `Conversation so far:\n${request.history.slice(-6).map(message => `${message.author === 'owner' ? 'OWNER' : 'THEM'}: ${message.text}`).join('\n')}` : '',
      `New incoming message: «${request.incoming}»`,
    ].filter(Boolean).join('\n\n');
    const schema = { name: 'twin_reply', schema: { type: 'object', additionalProperties: false, required: ['reply', 'abstain', 'rationale', 'usedExemplarIds', 'usedFactIds', 'confidence'], properties: {
      reply: { type: 'string' }, abstain: { type: 'boolean' }, rationale: { type: 'string', description: 'One or two Greek sentences: why this reply, in this register.' },
      usedExemplarIds: { type: 'array', items: { type: 'string' } }, usedFactIds: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' },
    } } };
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, usage } = await llm.chatJson<{ reply: string; abstain: boolean; rationale: string; usedExemplarIds: string[]; usedFactIds: string[]; confidence: number }>({ system, user: this.redactForModel(user + feedback), schema, maxTokens: 1200 });
      this.budget!.record(usage.totalTokens);
      if (data.abstain || !data.reply.trim() || data.confidence < 0.3) {
        return { text: '', engine: 'abstain' as Engine, confidence: Number(Math.max(0, data.confidence).toFixed(2)), abstained: true, rationale: this.depseudonymize(data.rationale || 'Δεν ξέρω τι θα έλεγες εδώ.'), style: { score: 0, notes: [] }, notes: [], model: llm.chatModel };
      }
      const text = this.depseudonymize(data.reply.trim());
      const guard = guardReply({ text, incoming: request.incoming, draft: '', relationship: RELATIONSHIP_TO_DEMO[register], availability, maxLength: request.platform === 'gmail' ? 900 : 400 });
      const style = metrics ? styleScore(text, metrics) : { score: 0.5, notes: [] };
      if (guard.passed && style.score >= 0.35) {
        const used = new Set(data.usedExemplarIds);
        return { text, engine: 'twin-llm' as Engine, confidence: Number(Math.min(1, Math.max(0, data.confidence)).toFixed(2)), abstained: false, rationale: this.depseudonymize(data.rationale), style, notes: exemplars.filter(item => used.has(item.id)).length ? [] : ['Το μοντέλο δεν δήλωσε ποιο παράδειγμα ακολούθησε.'], model: llm.chatModel };
      }
      feedback = `\n\nA previous draft was rejected by the owner's checks: ${[...guard.issues, ...style.notes].join(' ')} Fix this.`;
    }
    return null;
  }

  /** Redacted situational exemplars for other prompts (the Instagram/Gmail simulation's suggestions). */
  situational(incoming: string, platform: string, register: Relationship, contactName?: string, limit = 3) {
    const found = this.retrieve({ incoming, platform, relationship: register, contactName }, register, limit).filter(item => item.source === 'history' && (item.sameSituation || item.coverage >= 0.3));
    if (!found.length) return [];
    const rows = this.db.prepare(`SELECT m.id, m.text_redacted AS reply, r.text_redacted AS incoming FROM messages m JOIN messages r ON r.id = m.reply_to_message_id WHERE m.id IN (${found.map(() => '?').join(',')})`).all(...found.map(item => item.id)) as Array<{ id: string; reply: string; incoming: string }>;
    return rows.map(row => ({ id: row.id, incoming: row.incoming, reply: row.reply }));
  }

  /** Same model, no persona, no retrieval: the baseline the Studio and the Fidelity Lab compare against. */
  async generic(incoming: string): Promise<string | null> {
    if (!this.llm || !this.budget || this.budget.acquire()) return null;
    const { data, usage } = await this.llm.chatJson<{ reply: string }>({
      system: 'You are a helpful assistant. Write a short reply in Greek to the message below.', user: this.redactForModel(incoming), maxTokens: 800,
      schema: { name: 'generic_reply', schema: { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } } },
    });
    this.budget.record(usage.totalTokens);
    return this.depseudonymize(data.reply.trim());
  }
}
