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
import type { StyleProfile } from './style';
import { styleScore, type StyleMetrics, type StyleScore } from './style';
import { redactionNames } from './ingest';
import { createRedactor, type Redactor } from './redact';
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

interface CorpusPair extends Omit<Exemplar, 'score' | 'coverage' | 'sameSituation'> {
  sentAt: string;
  situations: string[];
  /** Term frequencies of the incoming message, built once so a query only does lookups. */
  tf: Map<string, number>;
  length: number;
  contactFolded: string;
}
interface Corpus {
  pairs: CorpusPair[];
  df: Map<string, number>;
  replyDf: Map<string, number>;
  avgLength: number;
  /** First five letters of every participant's name parts: names inflect (Αλέξανδρος → Αλέξανδρε), so compare stems. */
  namePrefixes: Set<string>;
}
interface Ranked { pair: CorpusPair; score: number; coverage: number; sameSituation: boolean }

/** Situational memory: past (incoming → owner reply) pairs and approved/edited drafts, never hold-out pairs. */
export class TwinEngine {
  private corpus?: Corpus;
  private profile?: StyleProfile | null;
  private people?: Array<{ name: string; pseudonym: string }>;
  private redactor?: Redactor;

  constructor(private readonly db: Database, private readonly llm?: LlmClient, private readonly budget?: UsageBudget) {}

  /** Call after any data change; everything derived from the store is rebuilt on next use. */
  invalidate() {
    this.corpus = undefined;
    this.profile = undefined;
    this.people = undefined;
    this.redactor = undefined;
  }

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
    const df = new Map<string, number>();
    const replyDf = new Map<string, number>();
    const contacts = new Map<string, string>();
    let totalLength = 0;
    const build = (pair: Omit<CorpusPair, 'tf' | 'length' | 'situations' | 'contactFolded'>): CorpusPair => {
      const list = tokens(pair.incoming);
      const tf = new Map<string, number>();
      for (const token of list) tf.set(token, (tf.get(token) ?? 0) + 1);
      for (const token of tf.keys()) df.set(token, (df.get(token) ?? 0) + 1);
      for (const token of new Set(tokens(pair.reply))) replyDf.set(token, (replyDf.get(token) ?? 0) + 1);
      totalLength += list.length;
      let contactFolded = contacts.get(pair.contact);
      if (contactFolded === undefined) { contactFolded = fold(pair.contact); contacts.set(pair.contact, contactFolded); }
      return { ...pair, tf, length: list.length, situations: situationsOf(pair.incoming, pair.sentAt), contactFolded };
    };
    const pairs = [
      ...rows.map(row => build({ ...row, source: 'history' })),
      ...feedback.map(row => build({ ...row, id: `fb_${row.id}`, contact: '', sentAt: row.sentAt.slice(0, 19), source: 'feedback' })),
    ];
    const namePrefixes = new Set<string>();
    for (const row of this.db.prepare('SELECT display_name AS name FROM participants').all() as Array<{ name: string }>) {
      for (const part of tokens(row.name)) if (part.length > 3) namePrefixes.add(part.slice(0, 5));
    }
    this.corpus = { pairs, df, replyDf, avgLength: totalLength / Math.max(1, pairs.length), namePrefixes };
    return this.corpus;
  }

  /**
   * Every relevant past pair, best first: BM25 on the incoming side, plus situation, register, same-person and
   * owner-feedback boosts. One pass over precomputed term frequencies, so a reply needs a single scan.
   * plain=true turns every persona signal off: the "no persona" ablation in the Fidelity Lab.
   */
  private rank(request: TwinRequest, register: Relationship, plain = false): Ranked[] {
    const corpus = this.load();
    const isName = (token: string) => corpus.namePrefixes.has(token.slice(0, 5));
    const n = corpus.pairs.length;
    // Per query token: its weight, computed once instead of once per pair.
    const query = [...new Set(tokens(request.incoming))].map(token => {
      const df = corpus.df.get(token) ?? 0;
      const generic = GENERIC.test(token) || isName(token);
      return { token, generic, weight: (generic ? 0.3 : 1) * Math.log(1 + (n - df + 0.5) / (df + 0.5)) };
    });
    const meaningful = query.filter(item => !item.generic);
    const sentAt = request.sentAt ?? `${DEFAULT_REFERENCE_DATE}T12:00:00`;
    const situations = new Set(situationsOf(request.incoming, sentAt));
    const contact = request.contactName ? fold(request.contactName) : undefined;
    const threshold = plain ? 0 : 1.5;
    const ranked: Ranked[] = [];
    for (const pair of corpus.pairs) {
      let score = 0;
      const norm = 1.2 * (0.25 + 0.75 * pair.length / Math.max(1, corpus.avgLength));
      for (const item of query) {
        const tf = pair.tf.get(item.token);
        if (tf) score += item.weight * (tf * 2.2) / (tf + norm);
      }
      const sameSituation = situations.size > 0 && pair.situations.some(situation => situations.has(situation));
      if (!plain) {
        if (sameSituation) score += 4;
        if (pair.relationship === register) score += 1.2;
        if (contact !== undefined && pair.contactFolded === contact) score += 1;
        if (pair.platform === request.platform) score += 0.3;
        if (pair.source === 'feedback') score *= 1.5;
      }
      if (score <= threshold) continue;
      let covered = 0;
      for (const item of meaningful) if (pair.tf.has(item.token)) covered++;
      ranked.push({ pair, score, coverage: meaningful.length ? covered / meaningful.length : 0, sameSituation });
    }
    ranked.sort((a, b) => b.score - a.score);
    // Prefer the register; fall back to other registers only when it has nothing relevant.
    if (plain) return ranked;
    const inRegister = ranked.filter(item => item.pair.relationship === register);
    return inRegister.length >= 2 ? inRegister : ranked;
  }

  private static exemplar({ pair, score, coverage, sameSituation }: Ranked): Exemplar {
    return { id: pair.id, incoming: pair.incoming, reply: pair.reply, platform: pair.platform, relationship: pair.relationship, contact: pair.contact, source: pair.source, score: Number(score.toFixed(2)), coverage: Number(coverage.toFixed(2)), sameSituation };
  }

  retrieve(request: TwinRequest, register: Relationship, limit = 5, plain = false): Exemplar[] {
    return this.rank(request, register, plain).slice(0, limit).map(TwinEngine.exemplar);
  }

  relevantFacts(request: TwinRequest, situations: string[]) {
    const facts = listFacts(this.db).filter(fact => fact.status !== 'rejected');
    const query = new Set(tokens(request.incoming));
    const situationFacts = facts.filter(fact => situations.some(situation => fact.statement.startsWith(SITUATIONS.find(item => item.id === situation)!.label)));
    const contactFacts = request.contactName ? facts.filter(fact => fact.category === 'relationship' && fold(fact.statement).startsWith(fold(request.contactName!))) : [];
    const lexical = facts.filter(fact => fact.category !== 'relationship')
      .map(fact => ({ fact, overlap: tokens(fact.statement).filter(token => query.has(token)).length }))
      .filter(item => item.overlap >= 1)
      .sort((a, b) => b.overlap - a.overlap)
      .map(item => item.fact);
    const unique = new Map([...situationFacts, ...contactFacts, ...lexical].map(fact => [fact.id, fact]));
    return [...unique.values()].slice(0, 6);
  }

  private metrics(register: Relationship): StyleMetrics | undefined {
    if (this.profile === undefined) this.profile = styleProfile(this.db);
    return this.profile?.byRelationship[register] ?? this.profile?.global;
  }

  private availability(request: TwinRequest): AvailabilityResult | undefined {
    const result = resolveAvailability(request.incoming, (request.sentAt ?? DEFAULT_REFERENCE_DATE).slice(0, 10), initialScheduleEvents, 60);
    // Only a real conflict (or a possible one) overrides how the owner usually decides.
    return result.status === 'conflict' || result.status === 'tentative' ? result : undefined;
  }

  /** Everything sent to a model goes through this: other people's names become pseudonyms, PII is removed. */
  redactForModel(text: string) {
    this.redactor ??= createRedactor({ names: redactionNames(this.db) });
    return this.redactor(text).text;
  }

  /** Local names come back after the model, which only ever sees pseudonyms. */
  depseudonymize(text: string) {
    if (!text.includes('Person_')) return text;
    this.people ??= this.db.prepare('SELECT display_name AS name, pseudonym FROM participants WHERE is_owner = 0').all() as Array<{ name: string; pseudonym: string }>;
    const names = new Map(this.people.map(person => [person.pseudonym, person.name.split(' ')[0]]));
    return text.replace(/\bPerson_[A-Z]+\b/g, pseudonym => names.get(pseudonym) ?? pseudonym);
  }

  async reply(request: TwinRequest): Promise<TwinReply> {
    const register = inferRegister(request);
    const sentAt = request.sentAt ?? `${DEFAULT_REFERENCE_DATE}T12:00:00`;
    const situations = situationsOf(request.incoming, sentAt);
    const ranked = this.rank(request, register);
    const exemplars = ranked.slice(0, 5).map(TwinEngine.exemplar);
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
    return { ...base, ...this.offline(request, register, exemplars, ranked.slice(0, 30).map(TwinEngine.exemplar), facts, metrics, availability) };
  }

  /** Offline twin: the owner's own words from the most similar past situation, or the calendar decision. */
  private offline(request: TwinRequest, register: Relationship, exemplars: Exemplar[], candidates: Exemplar[], facts: TwinReply['facts'], metrics?: StyleMetrics, availability?: AvailabilityResult) {
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
    const situational = candidates.filter(item => item.sameSituation).map(item => ({ item, generic: genericity(item.reply) })).sort((a, b) => b.generic - a.generic)[0]?.item;
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
