import type { Database } from './db';
import { detectLang, emojis, fold, words } from './text';
import type { Lang, Relationship } from './types';

/**
 * Deterministic style analysis of the OWNER's messages only (no LLM). Computed globally and per register
 * (relationship) and platform. Hold-out messages are excluded so the Fidelity Lab measures unseen replies.
 */

export interface StyleMetrics {
  messages: number;
  avgWords: number;
  medianChars: number;
  lengthBuckets: Record<'1-3' | '4-8' | '9-15' | '16-30' | '31+', number>;
  sentencesPerMessage: number;
  punctuation: { exclamation: number; doubleExclamation: number; ellipsis: number; question: number; noFinalPunctuation: number };
  capitalizedStart: number;
  emojiRate: number;
  emojisPerMessage: number;
  topEmojis: Array<{ emoji: string; count: number }>;
  openers: Array<{ phrase: string; count: number }>;
  signOffs: Array<{ phrase: string; count: number }>;
  catchphrases: Array<{ phrase: string; count: number }>;
  formality: number;
  informality: number;
  medianReplyMinutes: number | null;
  languages: Partial<Record<Lang, number>>;
  codeSwitching: number;
  activeHours: number[];
}

export interface StyleProfile {
  computedAt: string;
  global: StyleMetrics;
  byRelationship: Partial<Record<Relationship, StyleMetrics>>;
  byPlatform: Record<string, StyleMetrics>;
}

export interface OwnerMessage {
  id: string;
  text: string;
  sentAt: string;
  lang: Lang;
  platform: string;
  relationship: Relationship;
  threadId: string;
  replyTo?: { text: string; sentAt: string } | null;
}

const FORMAL = /(?<!\p{L})(σας|σάς|θα μπορούσατε|θα ήθελα|παρακαλώ|με εκτίμηση|ευχαριστώ πολύ|ευχαριστώ θερμά|αξιότιμ|κύριε|κυρία|καλησπέρα σας|καλημέρα σας)(?!\p{L})/iu;
const INFORMAL = /(?<!\p{L})(ρε|έλα|ελα|χαχα\S*|xaxa\S*|re|ela|τέλεια|οκ|ok|μωρέ|φιλαράκι|λολ|lol)(?!\p{L})|\p{Extended_Pictographic}/iu;
/** Compared in folded form (no accents, ς → σ), so «από», «απο» and «ΑΠΟ» are all stop words. */
const STOP = new Set(['και', 'να', 'το', 'τη', 'την', 'τον', 'του', 'της', 'σε', 'στο', 'στη', 'στην', 'με', 'για', 'από', 'που', 'θα', 'είναι', 'ο', 'η', 'οι', 'τα', 'τι', 'μου', 'σου', 'δεν', 'ένα', 'μια', 'αν', 'ότι', 'na', 'to', 'kai', 'the'].map(fold));

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const share = (count: number, total: number) => (total ? Number((count / total).toFixed(3)) : 0);
const top = (counts: Map<string, number>, limit: number, min = 1) => [...counts.entries()].filter(([, count]) => count >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([phrase, count]) => ({ phrase, count }));
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
const minutesBetween = (from: string, to: string) => (new Date(`${to}Z`).getTime() - new Date(`${from}Z`).getTime()) / 60_000;

/** Everything the metrics need from one message. Computed once and shared by every grouping. */
interface Analysis {
  words: number;
  chars: number;
  exclamation: boolean;
  doubleExclamation: boolean;
  ellipsis: boolean;
  question: boolean;
  noFinalPunctuation: boolean;
  startsWithLetter: boolean;
  capitalized: boolean;
  emojis: string[];
  formal: boolean;
  informal: boolean;
  sentences: number;
  opener?: string;
  signOff?: string;
  /** Catchphrase candidates: content words and 2–3 word phrases that are not only stop words. */
  phrases: string[];
  hour: number;
}

function analyse(message: OwnerMessage): Analysis {
  const text = message.text.trim();
  const first = /\p{L}/u.exec(text)?.[0];
  const tokens = words(text);
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const opener = lines.length ? /^[^,.!;?\n]{1,30}/.exec(lines[0] as string)?.[0] ?? tokens[0] : undefined;
  // Catchphrases keep accents so they read naturally («πες μου», not «πεσ μου»).
  const content = (text.toLocaleLowerCase('el').match(/[\p{L}\p{N}']+/gu) ?? []).filter(token => token.length > 1);
  const stop = content.map(token => STOP.has(fold(token)));
  const phrases: string[] = [];
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i + size <= content.length; i++) {
      let allStop = true;
      for (let j = i; j < i + size; j++) if (!stop[j]) { allStop = false; break; }
      if (!allStop) phrases.push(size === 2 ? `${content[i]} ${content[i + 1]}` : `${content[i]} ${content[i + 1]} ${content[i + 2]}`);
    }
  }
  content.forEach((token, index) => { if (!stop[index] && token.length > 2) phrases.push(token); });
  return {
    words: tokens.length,
    chars: message.text.length,
    exclamation: text.includes('!'),
    doubleExclamation: text.includes('!!'),
    ellipsis: text.includes('...') || text.includes('…'),
    question: /[?;]\s*(\p{Extended_Pictographic}\s*)*$/u.test(text) || text.includes('?'),
    noFinalPunctuation: !/[.!?;…:)]\s*(\p{Extended_Pictographic}\s*)*$/u.test(text),
    startsWithLetter: !!first,
    capitalized: !!first && first === first.toLocaleUpperCase('el') && first !== first.toLocaleLowerCase('el'),
    emojis: emojis(text),
    formal: FORMAL.test(text),
    informal: INFORMAL.test(text),
    sentences: Math.max(1, text.split(/[.!?;…]+(?:\s|$)/).filter(part => /\p{L}/u.test(part)).length),
    opener: opener ? opener.trim().toLocaleLowerCase('el') : undefined,
    signOff: lines.length >= 3 ? lines.slice(-2).join(' ').replace(/\s+/g, ' ').slice(0, 60) : undefined,
    phrases,
    hour: Number(message.sentAt.slice(11, 13)),
  };
}

/**
 * A message appears in several groupings (global, its relationship, its platform) and the profile is rebuilt after
 * every import, so its text is analysed once per process. Message ids are content hashes, so an id never changes text.
 */
const analyses = new Map<string, Analysis>();
const MAX_CACHED_ANALYSES = 200_000;
function analysisOf(message: OwnerMessage) {
  let analysis = analyses.get(message.id);
  if (!analysis || analysis.chars !== message.text.length) {
    if (analyses.size >= MAX_CACHED_ANALYSES) analyses.clear();
    analysis = analyse(message);
    analyses.set(message.id, analysis);
  }
  return analysis;
}

export function computeMetrics(messages: OwnerMessage[]): StyleMetrics {
  const n = messages.length;
  const buckets = { '1-3': 0, '4-8': 0, '9-15': 0, '16-30': 0, '31+': 0 } as StyleMetrics['lengthBuckets'];
  const emojiCounts = new Map<string, number>();
  const openers = new Map<string, number>();
  const signOffs = new Map<string, number>();
  const phrases = new Map<string, number>();
  const languages: Partial<Record<Lang, number>> = {};
  const hours = Array.from({ length: 24 }, () => 0);
  let wordTotal = 0, exclamation = 0, double = 0, ellipsis = 0, question = 0, noFinal = 0, capitalized = 0, letterStart = 0, withEmoji = 0, emojiTotal = 0, formal = 0, informal = 0, sentences = 0;
  const latencies: number[] = [];
  const chars: number[] = [];
  const byThread = new Map<string, OwnerMessage[]>();

  for (const message of messages) {
    const a = analysisOf(message);
    wordTotal += a.words;
    chars.push(a.chars);
    buckets[a.words <= 3 ? '1-3' : a.words <= 8 ? '4-8' : a.words <= 15 ? '9-15' : a.words <= 30 ? '16-30' : '31+']++;
    if (a.exclamation) exclamation++;
    if (a.doubleExclamation) double++;
    if (a.ellipsis) ellipsis++;
    if (a.question) question++;
    if (a.noFinalPunctuation) noFinal++;
    if (a.startsWithLetter) letterStart++;
    if (a.capitalized) capitalized++;
    if (a.emojis.length) withEmoji++;
    emojiTotal += a.emojis.length;
    for (const emoji of a.emojis) bump(emojiCounts, emoji);
    if (a.formal) formal++;
    if (a.informal) informal++;
    sentences += a.sentences;
    if (a.opener) bump(openers, a.opener);
    if (a.signOff) bump(signOffs, a.signOff);
    for (const phrase of a.phrases) bump(phrases, phrase);
    languages[message.lang] = (languages[message.lang] ?? 0) + 1;
    hours[a.hour]++;
    if (message.replyTo) {
      const minutes = minutesBetween(message.replyTo.sentAt, message.sentAt);
      if (minutes >= 0 && minutes < 72 * 60) latencies.push(minutes);
    }
    const thread = byThread.get(message.threadId);
    if (thread) thread.push(message); else byThread.set(message.threadId, [message]);
  }
  let switches = 0, consecutive = 0;
  for (const thread of byThread.values()) {
    const ordered = thread.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    for (let i = 1; i < ordered.length; i++) { consecutive++; if (ordered[i].lang !== ordered[i - 1].lang) switches++; }
  }
  // Catchphrases: repeated phrases, longest first so «πες μου ώρα» beats «πες».
  const catchphrases = top(phrases, 40, 3).sort((a, b) => b.phrase.split(' ').length * b.count - a.phrase.split(' ').length * a.count).slice(0, 10);

  return {
    messages: n,
    avgWords: n ? Number((wordTotal / n).toFixed(1)) : 0,
    medianChars: median(chars),
    lengthBuckets: buckets,
    sentencesPerMessage: n ? Number((sentences / n).toFixed(2)) : 0,
    punctuation: { exclamation: share(exclamation, n), doubleExclamation: share(double, n), ellipsis: share(ellipsis, n), question: share(question, n), noFinalPunctuation: share(noFinal, n) },
    capitalizedStart: share(capitalized, letterStart),
    emojiRate: share(withEmoji, n),
    emojisPerMessage: n ? Number((emojiTotal / n).toFixed(2)) : 0,
    topEmojis: top(emojiCounts, 6).map(item => ({ emoji: item.phrase, count: item.count })),
    openers: top(openers, 6, 2),
    signOffs: top(signOffs, 3, 2),
    catchphrases,
    formality: share(formal, n),
    informality: share(informal, n),
    medianReplyMinutes: latencies.length ? Math.round(median(latencies)) : null,
    languages,
    codeSwitching: share(switches, consecutive),
    activeHours: hours,
  };
}

export function loadOwnerMessages(db: Database, options: { includeHoldout?: boolean } = {}): OwnerMessage[] {
  const rows = db.prepare(`
    SELECT m.id, m.text, m.sent_at AS sentAt, m.lang, t.platform, t.relationship, m.thread_id AS threadId, r.text AS replyText, r.sent_at AS replySentAt
    FROM messages m
    JOIN threads t ON t.id = m.thread_id
    JOIN sources s ON s.id = m.source_id
    LEFT JOIN messages r ON r.id = m.reply_to_message_id
    WHERE m.is_owner = 1 AND s.included = 1 ${options.includeHoldout ? '' : 'AND m.holdout = 0'}
    ORDER BY m.sent_at`).all() as Array<{ id: string; text: string; sentAt: string; lang: Lang; platform: string; relationship: Relationship; threadId: string; replyText: string | null; replySentAt: string | null }>;
  return rows.map(row => ({ id: row.id, text: row.text, sentAt: row.sentAt, lang: row.lang, platform: row.platform, relationship: row.relationship, threadId: row.threadId, replyTo: row.replyText ? { text: row.replyText, sentAt: row.replySentAt! } : null }));
}

export function computeStyleProfile(db: Database, messages = loadOwnerMessages(db)): StyleProfile {
  const group = <K extends string>(key: (message: OwnerMessage) => K) => {
    const groups = new Map<K, OwnerMessage[]>();
    for (const message of messages) {
      const list = groups.get(key(message));
      if (list) list.push(message); else groups.set(key(message), [message]);
    }
    return Object.fromEntries([...groups.entries()].filter(([, list]) => list.length >= 3).map(([name, list]) => [name, computeMetrics(list)])) as Record<K, StyleMetrics>;
  };
  return { computedAt: new Date().toISOString(), global: computeMetrics(messages), byRelationship: group(message => message.relationship), byPlatform: group(message => message.platform) };
}

/** Features of one candidate reply, for comparing with a register's profile. */
export function textFeatures(text: string) {
  const tokens = words(text);
  const first = /\p{L}/u.exec(text)?.[0];
  return {
    words: tokens.length,
    emoji: emojis(text).length > 0,
    capitalized: !!first && first === first.toLocaleUpperCase('el') && first !== first.toLocaleLowerCase('el'),
    formal: FORMAL.test(text),
    informal: INFORMAL.test(text),
    lang: detectLang(text),
    exclamation: /!/.test(text),
  };
}

export interface StyleScore {
  /** 0 = nothing like the owner in this register, 1 = indistinguishable on our metrics. */
  score: number;
  notes: string[];
}

/**
 * Our own style scorer (no LLM): how well a candidate fits the owner's measured habits in a register.
 * Each feature contributes the probability the owner shows that behaviour, so it is interpretable.
 */
export function styleScore(text: string, metrics: StyleMetrics): StyleScore {
  if (!metrics.messages) return { score: 0.5, notes: ['Δεν υπάρχουν αρκετά δείγματα για σύγκριση.'] };
  const features = textFeatures(text);
  const notes: string[] = [];
  const parts: number[] = [];
  const agree = (has: boolean, rate: number, yes: string, no: string) => {
    const probability = has ? rate : 1 - rate;
    parts.push(probability);
    if (probability < 0.25) notes.push(has ? no : yes);
  };
  // Length: within the owner's typical range (log-ratio to the average).
  const ratio = Math.log((features.words + 1) / (metrics.avgWords + 1));
  const lengthFit = Math.exp(-(ratio * ratio) / 0.5);
  parts.push(lengthFit);
  if (lengthFit < 0.35) notes.push(features.words > metrics.avgWords ? `Πιο μεγάλο από το συνηθισμένο (~${metrics.avgWords} λέξεις).` : `Πιο σύντομο από το συνηθισμένο (~${metrics.avgWords} λέξεις).`);
  agree(features.emoji, metrics.emojiRate, 'Εδώ συνήθως βάζεις emoji.', 'Εδώ σπάνια βάζεις emoji.');
  agree(features.capitalized, metrics.capitalizedStart, 'Εδώ συνήθως ξεκινάς με κεφαλαίο.', 'Εδώ συνήθως γράφεις με πεζά.');
  agree(features.formal, metrics.formality, 'Εδώ γράφεις επίσημα (πληθυντικός ευγενείας).', 'Πολύ επίσημο για αυτή την περίσταση.');
  const langShare = (metrics.languages[features.lang] ?? 0) / Math.max(1, metrics.messages);
  parts.push(Math.max(0.05, langShare));
  if (langShare < 0.2) notes.push(`Σε αυτή την περίσταση σπάνια γράφεις σε ${features.lang}.`);
  const score = Math.exp(parts.reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / parts.length);
  return { score: Number(score.toFixed(3)), notes };
}
