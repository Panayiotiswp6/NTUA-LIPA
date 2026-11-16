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
const STOP = new Set(['και', 'να', 'το', 'τη', 'την', 'τον', 'του', 'της', 'σε', 'στο', 'στη', 'στην', 'με', 'για', 'από', 'που', 'θα', 'είναι', 'ειναι', 'ο', 'η', 'οι', 'τα', 'τι', 'μου', 'σου', 'δεν', 'ένα', 'μια', 'αν', 'ότι', 'οτι', 'na', 'to', 'kai', 'the']);

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

export function computeMetrics(messages: OwnerMessage[]): StyleMetrics {
  const n = messages.length;
  const lengths = messages.map(message => words(message.text).length);
  const buckets = { '1-3': 0, '4-8': 0, '9-15': 0, '16-30': 0, '31+': 0 } as StyleMetrics['lengthBuckets'];
  for (const length of lengths) buckets[length <= 3 ? '1-3' : length <= 8 ? '4-8' : length <= 15 ? '9-15' : length <= 30 ? '16-30' : '31+']++;
  const emojiCounts = new Map<string, number>();
  const openers = new Map<string, number>();
  const signOffs = new Map<string, number>();
  const ngrams = new Map<string, number>();
  const languages: Partial<Record<Lang, number>> = {};
  const hours = Array.from({ length: 24 }, () => 0);
  let exclamation = 0, double = 0, ellipsis = 0, question = 0, noFinal = 0, capitalized = 0, letterStart = 0, withEmoji = 0, emojiTotal = 0, formal = 0, informal = 0, sentences = 0;
  const latencies: number[] = [];
  let switches = 0, consecutive = 0;
  const byThread = new Map<string, OwnerMessage[]>();

  for (const message of messages) {
    const text = message.text.trim();
    if (/!/.test(text)) exclamation++;
    if (/!!/.test(text)) double++;
    if (/\.\.\.|…/.test(text)) ellipsis++;
    if (/[?;]\s*(\p{Extended_Pictographic}\s*)*$/u.test(text) || /\?/.test(text)) question++;
    if (!/[.!?;…:)]\s*(\p{Extended_Pictographic}\s*)*$/u.test(text)) noFinal++;
    const first = /\p{L}/u.exec(text)?.[0];
    if (first) { letterStart++; if (first === first.toLocaleUpperCase('el') && first !== first.toLocaleLowerCase('el')) capitalized++; }
    const found = emojis(text);
    if (found.length) withEmoji++;
    emojiTotal += found.length;
    for (const emoji of found) bump(emojiCounts, emoji);
    if (FORMAL.test(text)) formal++;
    if (INFORMAL.test(text)) informal++;
    sentences += Math.max(1, text.split(/[.!?;…]+(?:\s|$)/).filter(part => /\p{L}/u.test(part)).length);
    const tokens = words(text);
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const opener = lines.length ? /^[^,.!;?\n]{1,30}/.exec(lines[0] as string)?.[0] ?? tokens[0] : undefined;
    if (opener) bump(openers, opener.trim().toLocaleLowerCase('el'));
    if (lines.length >= 3) bump(signOffs, lines.slice(-2).join(' ').replace(/\s+/g, ' ').slice(0, 60));
    // Catchphrases keep accents so they read naturally («πες μου», not «πεσ μου»).
    const content = (text.toLocaleLowerCase('el').match(/[\p{L}\p{N}']+/gu) ?? []).filter(token => token.length > 1);
    for (let size = 2; size <= 3; size++) {
      for (let i = 0; i + size <= content.length; i++) {
        const gram = content.slice(i, i + size);
        if (gram.every(token => STOP.has(fold(token)))) continue;
        bump(ngrams, gram.join(' '));
      }
    }
    for (const token of content) if (!STOP.has(fold(token)) && token.length > 2) bump(ngrams, token);
    languages[message.lang] = (languages[message.lang] ?? 0) + 1;
    hours[Number(message.sentAt.slice(11, 13))]++;
    if (message.replyTo) {
      const minutes = minutesBetween(message.replyTo.sentAt, message.sentAt);
      if (minutes >= 0 && minutes < 72 * 60) latencies.push(minutes);
    }
    byThread.set(message.threadId, [...(byThread.get(message.threadId) ?? []), message]);
  }
  for (const thread of byThread.values()) {
    const ordered = thread.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    for (let i = 1; i < ordered.length; i++) { consecutive++; if (ordered[i].lang !== ordered[i - 1].lang) switches++; }
  }
  // Catchphrases: repeated n-grams, longest first so «πες μου ώρα» beats «πες».
  const catchphrases = top(ngrams, 40, 3).sort((a, b) => b.phrase.split(' ').length * b.count - a.phrase.split(' ').length * a.count).slice(0, 10);

  return {
    messages: n,
    avgWords: n ? Number((lengths.reduce((sum, value) => sum + value, 0) / n).toFixed(1)) : 0,
    medianChars: median(messages.map(message => message.text.length)),
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
  return rows.map(row => ({ ...row, replyTo: row.replyText ? { text: row.replyText, sentAt: row.replySentAt! } : null }));
}

export function computeStyleProfile(db: Database): StyleProfile {
  const messages = loadOwnerMessages(db);
  const group = <K extends string>(key: (message: OwnerMessage) => K) => {
    const groups = new Map<K, OwnerMessage[]>();
    for (const message of messages) groups.set(key(message), [...(groups.get(key(message)) ?? []), message]);
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
