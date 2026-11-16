import type { Database } from './db';
import { getSetting, setSetting, transaction } from './db';
import type { LlmClient } from '../llm';
import type { UsageBudget } from '../budget';
import { computeStyleProfile, loadOwnerMessages, type OwnerMessage, type StyleProfile } from './style';
import { fold, hash, words } from './text';

export type FactCategory = 'knowledge' | 'preference' | 'decision_pattern' | 'relationship' | 'habit';
export type FactStatus = 'auto' | 'confirmed' | 'edited' | 'rejected';
export type FactOrigin = 'rules' | 'llm' | 'owner';
export const FACT_CATEGORIES: FactCategory[] = ['knowledge', 'preference', 'decision_pattern', 'relationship', 'habit'];

export interface PersonaFact {
  id: string;
  category: FactCategory;
  statement: string;
  confidence: number;
  /** Message ids ("m_…") or document ids ("d_…") the fact is based on. */
  evidence: string[];
  status: FactStatus;
  origin: FactOrigin;
  updated_at: string;
}

interface Candidate { key: string; category: FactCategory; statement: string; confidence: number; evidence: string[]; origin: FactOrigin }

const DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const weekdayOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();

// ---------- decision patterns: situation → action, mined from (incoming → owner reply) pairs ----------
export const SITUATIONS: Array<{ id: string; label: string; test: (text: string, sentAt: string) => boolean }> = [
  { id: 'invite_lastminute_weekday', label: 'Όταν τον καλούν για έξοδο τελευταία στιγμή, καθημερινή', test: (text, sentAt) => INVITE.test(text) && LAST_MINUTE.test(text) && ![0, 6].includes(weekdayOf(sentAt)) },
  { id: 'invite_weekend', label: 'Όταν τον καλούν για έξοδο το Σαββατοκύριακο', test: (text, sentAt) => INVITE.test(text) && [0, 6].includes(weekdayOf(sentAt)) },
  { id: 'coffee_evening', label: 'Όταν του προτείνουν καφέ αργά το απόγευμα', test: (text, sentAt) => /καφ|kafe/i.test(text) && Number(sentAt.slice(11, 13)) >= 18 },
  { id: 'evening_study', label: 'Όταν του προτείνουν βραδινό διάβασμα ή συνάντηση εργασίας', test: text => /(διαβάσουμε|απόψε|βράδυ|στις 9|online|call)/i.test(text) && /(διάβ|online|ομάδ|εργασ|μπορείτε|project|call)/i.test(text) },
  { id: 'group_split', label: 'Όταν η ομάδα μοιράζει μια εργασία', test: text => /(μοιράζ|ποιο κομμάτι|αναλαμβάνεις)/i.test(text) },
  { id: 'meeting_request', label: 'Όταν του ζητούν συνάντηση χωρίς συγκεκριμένη ώρα', test: text => /(να βρεθούμε|να συναντηθούμε|συναντηθούμε|να κανονίσουμε|να το δούμε)/i.test(text) && !/\d{1,2}[:.]\d{2}|στις \d/.test(text) },
  { id: 'help_request', label: 'Όταν κάποιος έχει απορία ή έχει κολλήσει', test: text => /(κολλήσ|δεν καταλαβαίνω|απορία|βγαίνει λάθος|τι ζητάει)/i.test(text) },
];
const INVITE = /(πάμε|θες|θέλεις|έλα|έρχεσαι|θα έρθεις|να βρεθούμε|pame|ela|πάρτι|γενέθλια|για καφ|καφεδάκι|σινεμά|βόλτα|φαγητό|ποτό|mpira|mpasket|game)/i;
const LAST_MINUTE = /(σήμερα|απόψε|τώρα|twra|simera)/i;

export const ACTIONS: Array<{ id: string; label: string; test: (text: string) => boolean }> = [
  { id: 'decline', label: 'αρνείται', test: text => /(δεν (μπορώ|προλαβαίνω|αποδίδω|πίνω)|δύσκολα|den mporw|oxi re|δεν γίνεται)/i.test(text) },
  { id: 'weekend', label: 'προτείνει το Σαββατοκύριακο', test: text => /(σάββατο|κυριακή|σαββατοκύριακο|savvato|savvatokyriako)/i.test(text) },
  { id: 'morning', label: 'προτείνει πρωινή ώρα', test: text => /(πρωί|prwi)/i.test(text) },
  { id: 'accept', label: 'δέχεται', test: text => /^(ναι|nai|πάμε|έγινε|οκ|ok)\b|θα είμαι εκεί|μπαίνω/i.test(text.trim()) },
  { id: 'details', label: 'ζητά συγκεκριμένη μέρα/ώρα ή λεπτομέρειες', test: text => /(ποια μέρα|ποια ώρα|ποιο σημείο|πες μου ώρα|ποιο ακριβώς|στείλε μου|για ποιο|συγκεκριμένη ημέρα)/i.test(text) },
  { id: 'code', label: 'αναλαμβάνει τον κώδικα', test: text => /(αναλαμβάνω τον κώδικα|τον κώδικα)/i.test(text) },
  { id: 'split', label: 'προτείνει μοίρασμα ανά ερώτημα', test: text => /(μοιράσουμε|ανά ερώτημα)/i.test(text) },
  { id: 'alternative', label: 'προτείνει εναλλακτική δραστηριότητα', test: text => /(για βόλτα όμως|όμως είμαι)/i.test(text) },
];

function decisionPatterns(pairs: Array<OwnerMessage & { replyTo: { text: string; sentAt: string } }>): Candidate[] {
  const candidates: Candidate[] = [];
  for (const situation of SITUATIONS) {
    const matching = pairs.filter(pair => situation.test(pair.replyTo.text, pair.replyTo.sentAt));
    if (matching.length < 3) continue;
    const counts = new Map<string, { label: string; ids: string[] }>();
    for (const pair of matching) for (const action of ACTIONS) if (action.test(pair.text)) {
      const entry = counts.get(action.id) ?? { label: action.label, ids: [] };
      entry.ids.push(pair.id);
      counts.set(action.id, entry);
    }
    // Keep every action the owner takes in most of these situations.
    const habitual = [...counts.entries()].filter(([, entry]) => entry.ids.length / matching.length >= 0.6).sort((a, b) => b[1].ids.length - a[1].ids.length);
    if (!habitual.length) continue;
    const support = Math.min(...habitual.map(([, entry]) => entry.ids.length));
    const evidence = [...new Set(habitual.flatMap(([, entry]) => entry.ids))].slice(0, 8);
    candidates.push({
      key: `decision:${situation.id}`, category: 'decision_pattern', origin: 'rules', evidence,
      statement: `${situation.label}, συνήθως ${habitual.map(([, entry]) => entry.label).join(' και ')} (${support} από ${matching.length} φορές).`,
      confidence: Number(((support / matching.length) * (1 - 1 / (matching.length + 1))).toFixed(2)),
    });
  }
  return candidates;
}

// ---------- habits from timestamps and latency ----------
function habits(profile: StyleProfile, messages: OwnerMessage[]): Candidate[] {
  const candidates: Candidate[] = [];
  const hours = profile.global.activeHours;
  let bestStart = 0, best = -1;
  for (let start = 0; start < 24; start++) {
    const total = hours[start] + hours[(start + 1) % 24] + hours[(start + 2) % 24];
    if (total > best) { best = total; bestStart = start; }
  }
  if (profile.global.messages >= 20) {
    const evidence = messages.filter(message => { const hour = Number(message.sentAt.slice(11, 13)); return (hour - bestStart + 24) % 24 < 3; }).slice(-6).map(message => message.id);
    candidates.push({ key: 'habit:active_hours', category: 'habit', origin: 'rules', evidence, confidence: Number(Math.min(0.9, best / profile.global.messages + 0.4).toFixed(2)),
      statement: `Γράφει κυρίως ${String(bestStart).padStart(2, '0')}:00–${String((bestStart + 3) % 24).padStart(2, '0')}:00 (${Math.round((best / profile.global.messages) * 100)}% των μηνυμάτων του).` });
  }
  if (profile.global.medianReplyMinutes !== null) {
    const evidence = messages.filter(message => message.replyTo).slice(-5).map(message => message.id);
    candidates.push({ key: 'habit:latency', category: 'habit', origin: 'rules', evidence, confidence: 0.7,
      statement: `Απαντά συνήθως μέσα σε ${profile.global.medianReplyMinutes} λεπτά (διάμεσος).` });
  }
  for (const [relationship, metrics] of Object.entries(profile.byRelationship)) {
    if (relationship === 'work' && metrics && metrics.medianReplyMinutes !== null) {
      candidates.push({ key: 'habit:formal_latency', category: 'habit', origin: 'rules', confidence: 0.65,
        evidence: messages.filter(message => message.relationship === 'work' && message.replyTo).slice(-5).map(message => message.id),
        statement: `Σε επίσημα μηνύματα (καθηγητές, εταιρείες) απαντά την ίδια μέρα, σε περίπου ${Math.round(metrics.medianReplyMinutes / 60 * 10) / 10} ώρες.` });
    }
  }
  return candidates;
}

// ---------- relationships: how the owner writes to each person ----------
const LANG_TEXT: Record<string, string> = { el: 'ελληνικά', en: 'αγγλικά', greeklish: 'greeklish', mixed: 'μικτά ελληνικά-αγγλικά' };
const PLATFORM_NAME: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', gmail: 'Gmail', telegram: 'Telegram', messenger: 'Messenger' };
const EMOJI = /\p{Extended_Pictographic}/u;
const POLITE = /(σας|σάς|με εκτίμηση|θα μπορούσατε)/i;

function relationships(db: Database, messages: OwnerMessage[]): Candidate[] {
  // One-to-one conversations only, so group chats do not blur how the owner writes to each person.
  const threads = db.prepare(`
    SELECT m.thread_id AS threadId, MIN(p.id) AS personId, MIN(p.display_name) AS name, t.platform, COUNT(m.id) AS theirs
    FROM messages m JOIN participants p ON p.id = m.participant_id JOIN threads t ON t.id = m.thread_id JOIN sources s ON s.id = m.source_id
    WHERE p.is_owner = 0 AND s.included = 1
    GROUP BY m.thread_id HAVING COUNT(DISTINCT p.id) = 1`).all() as Array<{ threadId: string; personId: string; name: string; platform: string; theirs: number }>;
  const byThread = new Map<string, OwnerMessage[]>();
  for (const message of messages) {
    const list = byThread.get(message.threadId);
    if (list) list.push(message); else byThread.set(message.threadId, [message]);
  }
  const people = new Map<string, { name: string; platforms: Set<string>; theirs: number; mine: OwnerMessage[] }>();
  for (const thread of threads) {
    const person = people.get(thread.personId) ?? { name: thread.name, platforms: new Set<string>(), theirs: 0, mine: [] };
    person.platforms.add(thread.platform);
    person.theirs += thread.theirs;
    person.mine.push(...(byThread.get(thread.threadId) ?? []));
    people.set(thread.personId, person);
  }
  const candidates: Candidate[] = [];
  for (const [id, person] of people) {
    const mine = person.mine.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    if (person.theirs < 3 || mine.length < 3) continue;
    let emoji = 0, lower = 0, formal = 0;
    const langs = new Map<string, number>();
    for (const message of mine) {
      if (EMOJI.test(message.text)) emoji++;
      const first = /\p{L}/u.exec(message.text)?.[0];
      if (first && first === first.toLocaleLowerCase('el') && first !== first.toLocaleUpperCase('el')) lower++;
      if (POLITE.test(message.text)) formal++;
      langs.set(message.lang, (langs.get(message.lang) ?? 0) + 1);
    }
    const [lang, langCount] = [...langs.entries()].sort((a, b) => b[1] - a[1])[0];
    const traits = [
      formal / mine.length > 0.4 ? 'επίσημα, με πληθυντικό ευγενείας' : lower / mine.length > 0.6 ? 'χαλαρά, με πεζά' : 'φιλικά',
      emoji / mine.length > 0.3 ? `με emoji (${Math.round((emoji / mine.length) * 100)}%)` : emoji / mine.length < 0.05 ? 'χωρίς emoji' : '',
      `σε ${LANG_TEXT[lang] ?? lang} (${Math.round((langCount / mine.length) * 100)}%)`,
    ].filter(Boolean);
    candidates.push({
      key: `relationship:${id}`, category: 'relationship', origin: 'rules', confidence: Number(Math.min(0.95, 0.5 + mine.length / 100).toFixed(2)),
      evidence: mine.slice(-5).map(message => message.id),
      statement: `${person.name} (${[...person.platforms].sort().map(platform => PLATFORM_NAME[platform] ?? platform).join(', ')}): του γράφει ${traits.join(', ')}.`,
    });
  }
  return candidates;
}

// ---------- knowledge and preferences from the owner's own notes ----------
const PREFERENCE = /(προτιμ|δεν (πίνω|αποδίδω)|όχι μετά|αγαπημέν|μου αρέσει|καφές|πρωί)/i;
const HABIT = /(γυμναστήριο|κιθάρα|κάθε |προπόνηση)/i;
const DECISION = /(μοιράζουμε|αναλαμβάνω|μόνο με|συναντήσεις)/i;
function fromNotes(db: Database, messages: OwnerMessage[]): Candidate[] {
  const documents = db.prepare('SELECT d.id, d.title, d.text FROM documents d JOIN sources s ON s.id = d.source_id WHERE s.included = 1').all() as Array<{ id: string; title: string; text: string }>;
  const candidates: Candidate[] = [];
  // Tokenise the owner's messages once for all notes, and only when there are notes at all.
  let cached: Array<Set<string>> | undefined;
  const tokenSets = () => (cached ??= messages.map(message => new Set(words(message.text))));
  for (const document of documents) {
    // List items are the owner's own statements (goals, rules, preferences).
    const lines = document.text.split('\n')
      .filter(raw => /^\s*([-*+]|\d+\.)\s+/.test(raw))
      .map(raw => raw.replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/\*\*/g, '').trim())
      .filter(line => line.length > 12);
    for (const line of [...new Set(lines)].slice(0, 12)) {
      const keys = words(line).filter(token => token.length > 4);
      // Messages that share at least two of the note's content words back it up (first five are enough).
      const support: OwnerMessage[] = [];
      const sets = tokenSets();
      for (let index = 0; index < messages.length && support.length < 5; index++) {
        let shared = 0;
        for (const key of keys) if (sets[index].has(key) && ++shared >= 2) break;
        if (shared >= 2) support.push(messages[index]);
      }
      const category: FactCategory = DECISION.test(line) ? 'decision_pattern' : PREFERENCE.test(line) ? 'preference' : HABIT.test(line) ? 'habit' : 'knowledge';
      candidates.push({
        key: `note:${hash(document.id, line).slice(0, 12)}`, category, origin: 'rules',
        statement: `${/^να\s/i.test(line) ? `Στόχος: ${line[0].toLocaleLowerCase('el')}${line.slice(1)}` : line}`.replace(/\.$/, '') + ` (σημείωση «${document.title}»).`,
        confidence: Number(Math.min(0.9, 0.55 + support.length * 0.1).toFixed(2)),
        evidence: [document.id, ...support.map(message => message.id)],
      });
    }
  }
  return candidates;
}

// ---------- storage ----------
export function listFacts(db: Database): PersonaFact[] {
  return (db.prepare('SELECT * FROM persona_facts ORDER BY category, confidence DESC').all() as Array<Omit<PersonaFact, 'evidence'> & { evidence: string }>)
    .map(row => ({ ...row, evidence: JSON.parse(row.evidence) as string[] }));
}

/** Insert or refresh machine-made facts. The owner's decisions (confirmed / edited / rejected) always win. */
function upsert(db: Database, candidates: Candidate[], origin: FactOrigin, replaceStale: boolean) {
  const now = new Date().toISOString();
  const ids = new Set<string>();
  for (const candidate of candidates) {
    const id = `f_${hash(candidate.key).slice(0, 14)}`;
    ids.add(id);
    const existing = db.prepare('SELECT status FROM persona_facts WHERE id = ?').get(id) as { status: FactStatus } | undefined;
    if (!existing) {
      db.prepare('INSERT INTO persona_facts (id, category, statement, confidence, evidence, status, origin, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, candidate.category, candidate.statement, candidate.confidence, JSON.stringify(candidate.evidence), 'auto', candidate.origin, now);
    } else if (existing.status === 'auto') {
      db.prepare('UPDATE persona_facts SET statement = ?, confidence = ?, evidence = ?, updated_at = ? WHERE id = ?').run(candidate.statement, candidate.confidence, JSON.stringify(candidate.evidence), now, id);
    } else if (existing.status !== 'rejected') {
      db.prepare('UPDATE persona_facts SET evidence = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(candidate.evidence), now, id);
    }
  }
  if (replaceStale) {
    for (const row of db.prepare("SELECT id FROM persona_facts WHERE origin = ? AND status = 'auto'").all(origin) as Array<{ id: string }>) {
      if (!ids.has(row.id)) db.prepare('DELETE FROM persona_facts WHERE id = ?').run(row.id);
    }
  }
}

/** Recompute everything we derive with our own code. Runs after every import or settings change. */
export function refreshPersona(db: Database): StyleProfile {
  return transaction(db, () => {
    const messages = loadOwnerMessages(db);
    const profile = computeStyleProfile(db, messages);
    setSetting(db, 'style_profile', profile);
    const pairs = messages.filter((message): message is OwnerMessage & { replyTo: { text: string; sentAt: string } } => !!message.replyTo);
    upsert(db, [...decisionPatterns(pairs), ...habits(profile, messages), ...relationships(db, messages), ...fromNotes(db, messages)], 'rules', true);
    return profile;
  });
}

export function styleProfile(db: Database): StyleProfile | null {
  return getSetting<StyleProfile | null>(db, 'style_profile', null);
}

export function updateFact(db: Database, id: string, change: { status?: FactStatus; statement?: string }) {
  const fact = db.prepare('SELECT id FROM persona_facts WHERE id = ?').get(id);
  if (!fact) return false;
  if (change.statement !== undefined) db.prepare("UPDATE persona_facts SET statement = ?, status = 'edited', updated_at = ? WHERE id = ?").run(change.statement, new Date().toISOString(), id);
  if (change.status) db.prepare('UPDATE persona_facts SET status = ?, updated_at = ? WHERE id = ?').run(change.status, new Date().toISOString(), id);
  return true;
}

export function addOwnerFact(db: Database, category: FactCategory, statement: string) {
  const id = `f_${hash('owner', statement, Date.now().toString()).slice(0, 14)}`;
  db.prepare('INSERT INTO persona_facts (id, category, statement, confidence, evidence, status, origin, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)').run(id, category, statement, '[]', 'confirmed', 'owner', new Date().toISOString());
  return id;
}

/** Evidence for display: always the redacted text, with the message it answered for context. */
export function evidenceFor(db: Database, ids: string[]) {
  const messageIds = ids.filter(id => id.startsWith('m_')).slice(0, 20);
  const documentIds = ids.filter(id => id.startsWith('d_')).slice(0, 5);
  const messages = messageIds.length ? db.prepare(`
    SELECT m.id, m.sent_at AS sentAt, m.text_redacted AS text, m.is_owner AS isOwner, t.platform, t.title AS thread, r.text_redacted AS replyTo
    FROM messages m JOIN threads t ON t.id = m.thread_id LEFT JOIN messages r ON r.id = m.reply_to_message_id
    WHERE m.id IN (${messageIds.map(() => '?').join(',')}) ORDER BY m.sent_at`).all(...messageIds) : [];
  const documents = documentIds.length ? db.prepare(`SELECT id, title, substr(text_redacted, 1, 600) AS text FROM documents WHERE id IN (${documentIds.map(() => '?').join(',')})`).all(...documentIds) : [];
  return { messages, documents };
}

// ---------- LLM extraction (runs only when AI is enabled) ----------
interface LlmFact { category: string; statement: string; confidence: number; evidence: string[] }
export const FACTS_SCHEMA = {
  name: 'persona_facts',
  schema: {
    type: 'object', additionalProperties: false, required: ['facts'],
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['category', 'statement', 'confidence', 'evidence'],
          properties: {
            category: { type: 'string', enum: FACT_CATEGORIES },
            statement: { type: 'string', description: 'One short Greek sentence about the OWNER, in the third person.' },
            confidence: { type: 'number' },
            evidence: { type: 'array', items: { type: 'string' }, description: 'Ids of the messages that support the fact.' },
          },
        },
      },
    },
  },
};

const FACTS_SYSTEM = `You build an inspectable persona model of one person (the OWNER) from their own messages.
Extract durable facts ABOUT THE OWNER only: knowledge and skills, preferences, decision patterns (what they usually do in a kind of situation), relationships (how they relate to and write to someone), habits.
Rules: Greek, third person, one short sentence each. Every fact must cite the ids of the messages that support it. Do not state anything about other people except their relationship to the owner. Do not guess: skip what the messages do not show. Other people appear as pseudonyms (Person_A) — keep them.`;

const similar = (a: string, b: string) => {
  const left = new Set(words(fold(a)).filter(token => token.length > 3));
  const right = new Set(words(fold(b)).filter(token => token.length > 3));
  const shared = [...left].filter(token => right.has(token)).length;
  return shared / Math.max(1, Math.min(left.size, right.size));
};

export async function extractFactsWithLlm(db: Database, llm: LlmClient, budget: UsageBudget, options: { batchSize?: number; maxBatches?: number } = {}) {
  const rows = db.prepare(`
    SELECT m.id, m.text_redacted AS text, r.text_redacted AS incoming
    FROM messages m JOIN sources s ON s.id = m.source_id LEFT JOIN messages r ON r.id = m.reply_to_message_id
    WHERE m.is_owner = 1 AND m.holdout = 0 AND s.included = 1 ORDER BY m.sent_at DESC`).all() as Array<{ id: string; text: string; incoming: string | null }>;
  const batchSize = options.batchSize ?? 60;
  const batches = Math.min(options.maxBatches ?? 4, Math.ceil(rows.length / batchSize));
  const rejected = (db.prepare("SELECT statement FROM persona_facts WHERE status = 'rejected'").all() as Array<{ statement: string }>).map(row => row.statement);
  let added = 0, merged = 0, tokens = 0;
  for (let batch = 0; batch < batches; batch++) {
    const slice = rows.slice(batch * batchSize, (batch + 1) * batchSize);
    if (!slice.length) break;
    const blocked = budget.acquire();
    if (blocked) throw new Error(blocked);
    const ids = new Set(slice.map(row => row.id));
    const user = slice.map(row => `[${row.id}] ${row.incoming ? `Εκείνος/η: ${row.incoming.slice(0, 200)} → ` : ''}OWNER: ${row.text.slice(0, 400)}`).join('\n');
    const { data, usage } = await llm.chatJson<{ facts: LlmFact[] }>({ system: FACTS_SYSTEM, user, schema: FACTS_SCHEMA, maxTokens: 2500 });
    budget.record(usage.totalTokens);
    tokens += usage.totalTokens;
    transaction(db, () => {
      for (const fact of data.facts ?? []) {
        const evidence = (fact.evidence ?? []).filter(id => ids.has(id));
        if (!FACT_CATEGORIES.includes(fact.category as FactCategory) || !fact.statement?.trim() || !evidence.length) continue;
        if (rejected.some(statement => similar(statement, fact.statement) >= 0.6)) continue;
        const existing = listFacts(db).find(item => item.category === fact.category && item.status !== 'rejected' && similar(item.statement, fact.statement) >= 0.6);
        if (existing) {
          const union = [...new Set([...existing.evidence, ...evidence])].slice(0, 12);
          db.prepare('UPDATE persona_facts SET evidence = ?, confidence = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(union), Math.min(0.97, Math.max(existing.confidence, fact.confidence) + 0.05), new Date().toISOString(), existing.id);
          merged++;
        } else {
          upsert(db, [{ key: `llm:${fact.category}:${fold(fact.statement)}`, category: fact.category as FactCategory, statement: fact.statement.trim(), confidence: Math.max(0, Math.min(1, fact.confidence)), evidence, origin: 'llm' }], 'llm', false);
          added++;
        }
      }
    });
  }
  return { added, merged, batches, tokens };
}
