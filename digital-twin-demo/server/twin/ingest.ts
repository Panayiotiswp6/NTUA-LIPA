import path from 'node:path';
import { getSetting, setSetting, transaction, type Database } from './db';
import { parseUpload } from './importers';
import { createRedactor, pseudonymFor } from './redact';
import { detectLang, fold, hash } from './text';
import type { InputFile, Lang, ParsedSource, Relationship } from './types';

export interface SourceStats {
  messages: number;
  added: number;
  duplicates: number;
  documents: number;
  threads: number;
  from?: string;
  to?: string;
  ownerShare: number;
  languages: Partial<Record<Lang, number>>;
}

export interface ImportStage { stage: 'parsed' | 'stored' | 'redacted' | 'linked' | 'style'; label: string; count: number; ms: number }

export interface ImportReport {
  sources: Array<{ id: string; kind: string; platform: string; filename: string; stats: SourceStats; warnings: string[] }>;
  unrecognised: string[];
  stages: ImportStage[];
  owner: OwnerState;
}

export interface OwnerState {
  confirmed: boolean;
  participants: Array<{ id: string; name: string }>;
  /** Most likely "me" candidates when the owner is not confirmed. */
  candidates: Array<{ id: string; name: string; threads: number; messages: number }>;
}

const participantId = (name: string) => `p_${hash(fold(name).trim()).slice(0, 12)}`;
const threadId = (platform: string, key: string) => `th_${hash(platform, key).slice(0, 12)}`;
/** One source per uploaded file and format, so re-uploading the same export updates it instead of adding a copy. */
const sourceId = (kind: string, upload: string) => `src_${hash(kind, path.basename(upload)).slice(0, 12)}`;

/** Owner aliases are folded names and handles; once confirmed, later imports map automatically. */
const aliases = (db: Database) => new Set(getSetting<string[]>(db, 'owner_aliases', []));
const isOwnerName = (owner: Set<string>, name: string, handle?: string) => owner.has(fold(name).trim()) || (!!handle && owner.has(handle.toLowerCase()));

/** First free pseudonym, so two people never share one even after sources were deleted. */
function nextPseudonym(used: Set<string>) {
  for (let index = 0; ; index++) {
    const pseudonym = pseudonymFor(index);
    if (!used.has(pseudonym)) { used.add(pseudonym); return pseudonym; }
  }
}

/** After "me" changes: the owner is «Owner», and nobody else keeps that label. */
function normalizePseudonyms(db: Database) {
  db.exec("UPDATE participants SET pseudonym = 'Owner' WHERE is_owner = 1 AND pseudonym != 'Owner'");
  const used = new Set((db.prepare('SELECT pseudonym FROM participants WHERE is_owner = 0').all() as Array<{ pseudonym: string }>).map(row => row.pseudonym));
  const rename = db.prepare('UPDATE participants SET pseudonym = ? WHERE id = ?');
  for (const row of db.prepare("SELECT id FROM participants WHERE is_owner = 0 AND pseudonym = 'Owner' ORDER BY id").all() as Array<{ id: string }>) rename.run(nextPseudonym(used), row.id);
}

/** Copy participants.is_owner onto their messages, writing only the rows that differ. */
function syncMessageOwnership(db: Database) {
  db.exec(`UPDATE messages SET is_owner = (SELECT is_owner FROM participants WHERE participants.id = messages.participant_id)
    WHERE is_owner != (SELECT is_owner FROM participants WHERE participants.id = messages.participant_id)`);
}

/**
 * Suggest "me" only when the data says so: an explicit hint (mbox account, Telegram profile) or presence in clearly
 * more conversations than anyone else. A single one-to-one chat is ambiguous, so the owner stays unset until then.
 * Returns true when the owner changed, which is the only case that needs a full relink and re-redaction.
 */
function resolveOwner(db: Database): boolean {
  if (getSetting(db, 'owner_confirmed', false)) return false;
  const hints = new Set(getSetting<string[]>(db, 'owner_hints', []));
  const people = db.prepare(`
    SELECT p.id, p.display_name AS name, p.handles, p.is_owner AS isOwner, COUNT(DISTINCT m.thread_id) AS threads, COUNT(m.id) AS messages
    FROM participants p JOIN messages m ON m.participant_id = p.id GROUP BY p.id`).all() as Array<{ id: string; name: string; handles: string; isOwner: number; threads: number; messages: number }>;
  const hinted = (person: typeof people[number]) => hints.has(fold(person.name).trim()) || (JSON.parse(person.handles) as string[]).some(handle => hints.has(handle.toLowerCase()));
  const ranked = [...people].sort((a, b) => Number(hinted(b)) - Number(hinted(a)) || b.threads - a.threads || b.messages - a.messages);
  const [best, second] = ranked;
  const confident = best && (hinted(best) || (best.threads >= 2 && best.threads > (second?.threads ?? 0)));
  const owner = confident ? best : undefined;
  const current = people.filter(person => person.isOwner).map(person => person.id);
  if (current.length === (owner ? 1 : 0) && current[0] === owner?.id) return false;
  setSetting(db, 'owner_aliases', owner ? [fold(owner.name).trim(), ...(JSON.parse(owner.handles) as string[]).map(handle => handle.toLowerCase())] : []);
  db.exec('UPDATE participants SET is_owner = 0 WHERE is_owner = 1');
  if (owner) db.prepare('UPDATE participants SET is_owner = 1 WHERE id = ?').run(owner.id);
  normalizePseudonyms(db);
  syncMessageOwnership(db);
  return true;
}

export function ownerState(db: Database): OwnerState {
  const participants = db.prepare('SELECT id, display_name AS name FROM participants WHERE is_owner = 1 ORDER BY display_name').all() as Array<{ id: string; name: string }>;
  const candidates = db.prepare(`
    SELECT p.id, p.display_name AS name, COUNT(DISTINCT m.thread_id) AS threads, COUNT(m.id) AS messages
    FROM participants p JOIN messages m ON m.participant_id = p.id
    GROUP BY p.id ORDER BY threads DESC, messages DESC LIMIT 8`).all() as OwnerState['candidates'];
  return { confirmed: getSetting(db, 'owner_confirmed', false), participants, candidates };
}

const FORMAL = /(σας|σάς|θα μπορούσατε|με εκτίμηση|αξιότιμ|κύριε|κυρία|ευχαριστώ θερμά|παρακαλώ)/i;
const STUDY = /(εργασ|μάθημα|μαθήματ|εξετα|άσκηση|ασκήσ|εργαστήρ|lab|project|προθεσμ|παράδοσ|διάλεξ|φροντιστήρ)/i;
const FAMILY = /(μαμά|μπαμπά|γιαγιά|παππού|θεία|θείο|αδερφ|ξαδερφ)/i;

interface ThreadRow { id: string; is_owner: number; hash: string; reply: string | null; holdout: number; text: string; participant_id: string }

function inferRelationship(rows: ThreadRow[], title: string): Relationship {
  const owner = rows.filter(row => row.is_owner);
  if (!rows.length) return 'unknown';
  const share = (list: ThreadRow[], pattern: RegExp) => list.filter(row => pattern.test(row.text)).length / Math.max(1, list.length);
  const people = new Set(rows.map(row => row.participant_id)).size;
  if (FAMILY.test(title) || share(rows, FAMILY) > 0.1) return 'family';
  if (owner.length && share(owner, FORMAL) > 0.4) return 'work';
  if (STUDY.test(title) || share(rows, STUDY) > 0.2 || (people >= 3 && share(rows, STUDY) > 0.05)) return 'study';
  return 'friend';
}

/** Other people's full and first names with their pseudonyms, in a stable order. */
export function redactionNames(db: Database) {
  const others = db.prepare('SELECT display_name AS name, pseudonym FROM participants WHERE is_owner = 0 ORDER BY id').all() as Array<{ name: string; pseudonym: string }>;
  return others.flatMap(person => {
    const first = person.name.split(/\s+/)[0];
    return [{ name: person.name, pseudonym: person.pseudonym }, ...(first.length >= 3 && first !== person.name ? [{ name: first, pseudonym: person.pseudonym }] : [])];
  });
}

/**
 * Keep text_redacted current. Redaction depends on who else is known and who "me" is, so every message is
 * redone only when that set changed; otherwise just the messages stored by this import are redacted.
 * Returns how many messages were checked.
 */
export function reredact(db: Database, added?: Array<{ id: string; text: string }>): number {
  const names = redactionNames(db);
  const signature = hash(...names.map(item => `${item.name}=${item.pseudonym}`));
  const redactor = createRedactor({ names });
  const update = db.prepare('UPDATE messages SET text_redacted = ? WHERE id = ?');
  let checked = 0;
  if (!added || getSetting(db, 'redaction_signature', '') !== signature) {
    for (const row of db.prepare('SELECT id, text, text_redacted AS current FROM messages').all() as Array<{ id: string; text: string; current: string }>) {
      const next = redactor(row.text).text;
      if (next !== row.current) update.run(next, row.id);
      checked++;
    }
    setSetting(db, 'redaction_signature', signature);
  } else {
    for (const message of added) {
      const next = redactor(message.text).text;
      if (next !== message.text) update.run(next, message.id);
      checked++;
    }
  }
  // Documents are few; always refresh them.
  const updateDocument = db.prepare('UPDATE documents SET text_redacted = ? WHERE id = ?');
  for (const row of db.prepare('SELECT id, text, text_redacted AS current FROM documents').all() as Array<{ id: string; text: string; current: string }>) {
    const next = redactor(row.text).text;
    if (next !== row.current) updateDocument.run(next, row.id);
  }
  return checked;
}

/**
 * Link each owner message to what it answered (the latest incoming message since the owner last wrote),
 * hold out ~12% of those pairs for fidelity evaluation, and infer each thread's relationship.
 * With threadIds, only those conversations are revisited; rows are written only when something changed.
 */
export function relink(db: Database, threadIds?: Iterable<string>) {
  const one = db.prepare('SELECT id, title, relationship, relationship_source FROM threads WHERE id = ?');
  const threads = (threadIds
    ? [...new Set(threadIds)].map(id => one.get(id)).filter(Boolean)
    : db.prepare('SELECT id, title, relationship, relationship_source FROM threads').all()) as Array<{ id: string; title: string; relationship: string; relationship_source: string }>;
  const rowsOf = db.prepare('SELECT id, is_owner, hash, reply_to_message_id AS reply, holdout, text, participant_id FROM messages WHERE thread_id = ? ORDER BY sent_at, id');
  const setReply = db.prepare('UPDATE messages SET reply_to_message_id = ?, holdout = ? WHERE id = ?');
  const setRelationship = db.prepare('UPDATE threads SET relationship = ? WHERE id = ?');
  for (const thread of threads) {
    const rows = rowsOf.all(thread.id) as unknown as ThreadRow[];
    let lastIncoming: string | null = null;
    for (const row of rows) {
      if (!row.is_owner) {
        // Not the owner's (any more): it cannot be a reply pair or a hold-out.
        if (row.reply !== null || row.holdout) setReply.run(null, 0, row.id);
        lastIncoming = row.id;
        continue;
      }
      const holdout = lastIncoming && parseInt(row.hash.slice(0, 4), 16) % 100 < 12 ? 1 : 0;
      if (row.reply !== lastIncoming || row.holdout !== holdout) setReply.run(lastIncoming, holdout, row.id);
      lastIncoming = null;
    }
    if (thread.relationship_source !== 'owner') {
      const relationship = inferRelationship(rows, thread.title);
      if (relationship !== thread.relationship) setRelationship.run(relationship, thread.id);
    }
  }
}

export function setOwner(db: Database, participantIds: string[]) {
  transaction(db, () => {
    const people = participantIds.length
      ? db.prepare(`SELECT display_name, handles FROM participants WHERE id IN (${participantIds.map(() => '?').join(',')})`).all(...participantIds) as Array<{ display_name: string; handles: string }>
      : [];
    const names = people.flatMap(person => [fold(person.display_name).trim(), ...(JSON.parse(person.handles) as string[]).map(handle => handle.toLowerCase())]);
    setSetting(db, 'owner_aliases', [...new Set(names)]);
    setSetting(db, 'owner_confirmed', true);
    db.exec('UPDATE participants SET is_owner = 0 WHERE is_owner = 1');
    if (participantIds.length) db.prepare(`UPDATE participants SET is_owner = 1 WHERE id IN (${participantIds.map(() => '?').join(',')})`).run(...participantIds);
    normalizePseudonyms(db);
    syncMessageOwnership(db);
    relink(db);
    reredact(db);
    refreshAllStats(db);
  });
}

function sourceStats(db: Database, id: string, added: number, duplicates: number): SourceStats {
  const summary = db.prepare('SELECT COUNT(*) AS messages, MIN(sent_at) AS first, MAX(sent_at) AS last, SUM(is_owner) AS owner, COUNT(DISTINCT thread_id) AS threads FROM messages WHERE source_id = ?').get(id) as { messages: number; first?: string; last?: string; owner?: number; threads: number };
  const languages = Object.fromEntries((db.prepare('SELECT lang, COUNT(*) AS n FROM messages WHERE source_id = ? GROUP BY lang').all(id) as Array<{ lang: Lang; n: number }>).map(row => [row.lang, row.n]));
  const documents = (db.prepare('SELECT COUNT(*) AS n FROM documents WHERE source_id = ?').get(id) as { n: number }).n;
  return {
    messages: summary.messages, added, duplicates, documents, threads: summary.threads,
    from: summary.first ?? undefined, to: summary.last ?? undefined,
    ownerShare: summary.messages ? Number(((summary.owner ?? 0) / summary.messages).toFixed(3)) : 0,
    languages,
  };
}

function refreshAllStats(db: Database) {
  for (const source of db.prepare('SELECT id, stats FROM sources').all() as Array<{ id: string; stats: string }>) {
    const previous = JSON.parse(source.stats) as Partial<SourceStats>;
    db.prepare('UPDATE sources SET stats = ? WHERE id = ?').run(JSON.stringify(sourceStats(db, source.id, previous.added ?? 0, previous.duplicates ?? 0)), source.id);
  }
}

/** Store parsed exports. Idempotent: the same message (platform, chat, sender, time, text) is stored once. */
export function ingestParsed(db: Database, upload: string, parsed: ParsedSource[], unrecognised: string[] = [], parseMs = 0): ImportReport {
  const stages: ImportStage[] = [{ stage: 'parsed', label: 'Ανάλυση αρχείων', count: parsed.reduce((sum, source) => sum + source.messages.length + source.documents.length, 0), ms: parseMs }];
  const started = Date.now();
  const report = transaction(db, () => {
    const owner = aliases(db);
    const hints = parsed.flatMap(source => source.ownerHints).map(hint => fold(hint).trim());
    if (hints.length) setSetting(db, 'owner_hints', [...new Set([...getSetting<string[]>(db, 'owner_hints', []), ...hints])]);

    const insertSource = db.prepare('INSERT INTO sources (id, kind, filename, imported_at, stats) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET imported_at = excluded.imported_at');
    const insertParticipant = db.prepare('INSERT INTO participants (id, display_name, pseudonym, is_owner, handles) VALUES (?, ?, ?, ?, ?)');
    const updateHandles = db.prepare('UPDATE participants SET handles = ? WHERE id = ?');
    const insertThread = db.prepare('INSERT INTO threads (id, source_id, platform, external_key, title) VALUES (?, ?, ?, ?, ?) ON CONFLICT(platform, external_key) DO NOTHING');
    const hasMessage = db.prepare('SELECT 1 FROM messages WHERE hash = ?');
    const insertMessage = db.prepare(`INSERT INTO messages (id, thread_id, source_id, participant_id, sent_at, text, text_redacted, lang, is_owner, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING`);
    const insertDocument = db.prepare('INSERT INTO documents (id, source_id, title, text, text_redacted, hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING');

    // An export repeats the same few senders and chats thousands of times: resolve each one once.
    const participants = new Map((db.prepare('SELECT id, handles, pseudonym FROM participants').all() as Array<{ id: string; handles: string; pseudonym: string }>).map(row => [row.id, JSON.parse(row.handles) as string[]]));
    const usedPseudonyms = new Set((db.prepare('SELECT pseudonym FROM participants').all() as Array<{ pseudonym: string }>).map(row => row.pseudonym));
    const senders = new Map<string, { pid: string; folded: string }>();
    const ensuredThreads = new Map<string, string>();
    const added: Array<{ id: string; text: string }> = [];
    const touchedThreads = new Set<string>();

    const results = new Map<string, ImportReport['sources'][number]>();
    for (const source of parsed) {
      const id = sourceId(source.kind, upload);
      insertSource.run(id, source.kind, path.basename(upload), new Date().toISOString(), '{}');
      const result = results.get(id) ?? { id, kind: source.kind, platform: source.platform, filename: path.basename(upload), stats: { added: 0, duplicates: 0 } as SourceStats, warnings: [] };
      results.set(id, result);
      let stored = 0, duplicates = 0;
      for (const message of source.messages) {
        let sender = senders.get(message.sender);
        if (!sender) { sender = { pid: participantId(message.sender), folded: fold(message.sender) }; senders.set(message.sender, sender); }
        const mine = isOwnerName(owner, message.sender, message.senderHandle);
        const handles = participants.get(sender.pid);
        if (!handles) {
          const fresh = message.senderHandle ? [message.senderHandle] : [];
          insertParticipant.run(sender.pid, message.sender, mine ? 'Owner' : nextPseudonym(usedPseudonyms), mine ? 1 : 0, JSON.stringify(fresh));
          participants.set(sender.pid, fresh);
        } else if (message.senderHandle && !handles.includes(message.senderHandle)) {
          handles.push(message.senderHandle);
          updateHandles.run(JSON.stringify(handles), sender.pid);
        }
        const threadKey = `${source.platform}\u241f${message.threadKey}`;
        let tid = ensuredThreads.get(threadKey);
        if (!tid) {
          tid = threadId(source.platform, message.threadKey);
          insertThread.run(tid, id, source.platform, message.threadKey, message.threadTitle);
          ensuredThreads.set(threadKey, tid);
        }
        const digest = hash(source.platform, message.threadKey, sender.folded, message.sentAt, message.text);
        // Re-imports are mostly duplicates: an index lookup is cheaper than analysing the text again.
        if (hasMessage.get(digest)) { duplicates++; continue; }
        const mid = `m_${digest.slice(0, 16)}`;
        const inserted = insertMessage.run(mid, tid, id, sender.pid, message.sentAt, message.text, message.text, detectLang(message.text), mine ? 1 : 0, digest);
        if (inserted.changes) { stored++; added.push({ id: mid, text: message.text }); touchedThreads.add(tid); } else duplicates++;
      }
      for (const document of source.documents) {
        const digest = hash('document', document.text);
        const inserted = insertDocument.run(`d_${digest.slice(0, 16)}`, id, document.title, document.text, document.text, digest);
        if (inserted.changes) stored++; else duplicates++;
      }
      result.stats.added += stored;
      result.stats.duplicates += duplicates;
      result.warnings.push(...source.warnings);
    }
    stages.push({ stage: 'stored', label: 'Αποθήκευση & αφαίρεση διπλών', count: [...results.values()].reduce((sum, item) => sum + item.stats.added, 0), ms: Date.now() - started });

    let step = Date.now();
    const ownerChanged = resolveOwner(db);
    const checked = reredact(db, added);
    stages.push({ stage: 'redacted', label: 'Απόκρυψη προσωπικών δεδομένων', count: checked, ms: Date.now() - step });
    step = Date.now();
    // Only conversations that received messages can have new reply pairs, unless "me" changed.
    relink(db, ownerChanged ? undefined : touchedThreads);
    stages.push({ stage: 'linked', label: 'Ζεύγη ερώτησης → απάντησης', count: (db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_owner = 1 AND reply_to_message_id IS NOT NULL').get() as { n: number }).n, ms: Date.now() - step });

    for (const item of results.values()) {
      const stats = sourceStats(db, item.id, item.stats.added, item.stats.duplicates);
      db.prepare('UPDATE sources SET stats = ? WHERE id = ?').run(JSON.stringify(stats), item.id);
      item.stats = stats;
    }
    // Earlier sources change too when "me" becomes known.
    if (ownerChanged) refreshAllStats(db);
    return { sources: [...results.values()], unrecognised, stages, owner: ownerState(db) };
  });
  return report;
}

export async function importUpload(db: Database, file: InputFile): Promise<ImportReport> {
  const started = Date.now();
  const { sources, unrecognised } = await parseUpload(file);
  return ingestParsed(db, file.name, sources, unrecognised, Date.now() - started);
}

export function listSources(db: Database) {
  return (db.prepare('SELECT id, kind, filename, imported_at, included, stats FROM sources ORDER BY imported_at').all() as Array<{ id: string; kind: string; filename: string; imported_at: string; included: number; stats: string }>)
    .map(row => ({ ...row, included: !!row.included, stats: JSON.parse(row.stats) as SourceStats }));
}

export function setSourceIncluded(db: Database, id: string, included: boolean) {
  return db.prepare('UPDATE sources SET included = ? WHERE id = ?').run(included ? 1 : 0, id).changes > 0;
}

export function deleteSource(db: Database, id: string) {
  return transaction(db, () => {
    const removed = db.prepare('DELETE FROM sources WHERE id = ?').run(id).changes > 0;
    db.exec('DELETE FROM participants WHERE id NOT IN (SELECT DISTINCT participant_id FROM messages)');
    return removed;
  });
}

export function deleteEverything(db: Database) {
  transaction(db, () => {
    for (const table of ['messages', 'documents', 'threads', 'participants', 'sources', 'persona_facts', 'feedback_events']) db.exec(`DELETE FROM ${table}`);
    // Remember that the first-start demo already ran, so deleting everything is not undone by a restart.
    db.exec("DELETE FROM settings WHERE key != 'seeded_once'");
  });
}
