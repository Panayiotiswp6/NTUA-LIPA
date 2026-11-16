import express, { type Request, type Response } from 'express';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Database } from './db';
import { setSetting } from './db';
import { MAX_UPLOAD_BYTES } from './importers';
import { UnsafeArchiveError } from './importers/zip';
import { deleteEverything, deleteSource, importUpload, listSources, ownerState, setOwner, setSourceIncluded } from './ingest';
import { addOwnerFact, evidenceFor, extractFactsWithLlm, FACT_CATEGORIES, listFacts, styleProfile, updateFact, type FactCategory, type FactStatus } from './persona';
import type { LlmClient } from '../llm';
import type { UsageBudget } from '../budget';
import { askTwin } from './ask';
import { TwinEngine } from './engine';
import { STUDIO_INBOX } from './studio';

export interface TwinContext {
  db: Database;
  sampleDir: string;
  /** Called after any data change so derived models (style, persona) can refresh. */
  onDataChanged?: () => void;
  /** Present only while AI is enabled; every LLM path checks it. */
  llm?: LlmClient;
  budget?: UsageBudget;
}

/** Import the bundled synthetic persona exactly as a user would: through the same parsers and pipeline. */
export async function loadDemoPersona(context: TwinContext) {
  deleteEverything(context.db);
  const files = existsSync(context.sampleDir) ? readdirSync(context.sampleDir).filter(name => !name.startsWith('.')).sort() : [];
  const reports = [];
  for (const name of files) reports.push(await importUpload(context.db, { name, data: readFileSync(path.join(context.sampleDir, name)) }));
  // The demo owner is known; a real user confirms this once on the Import page.
  const owner = ownerState(context.db).participants.map(person => person.id);
  if (owner.length) setOwner(context.db, owner);
  setSetting(context.db, 'demo_loaded', true);
  context.onDataChanged?.();
  return reports;
}

export function counts(db: Database) {
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    messages: one('SELECT COUNT(*) AS n FROM messages'),
    ownerMessages: one('SELECT COUNT(*) AS n FROM messages WHERE is_owner = 1'),
    pairs: one('SELECT COUNT(*) AS n FROM messages WHERE is_owner = 1 AND reply_to_message_id IS NOT NULL'),
    holdout: one('SELECT COUNT(*) AS n FROM messages WHERE holdout = 1'),
    threads: one('SELECT COUNT(*) AS n FROM threads'),
    documents: one('SELECT COUNT(*) AS n FROM documents'),
    facts: one("SELECT COUNT(*) AS n FROM persona_facts WHERE status != 'rejected'"),
  };
}

const RELATIONSHIPS = new Set(['friend', 'family', 'study', 'work', 'unknown']);
const fail = (response: Response, status: number, error: string) => response.status(status).json({ error });

const PLATFORMS = new Set(['whatsapp', 'telegram', 'gmail', 'instagram', 'messenger']);
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function twinRouter(context: TwinContext) {
  const router = express.Router();
  const { db } = context;
  const engine = new TwinEngine(db, context.llm, context.budget);
  // Every data change also refreshes the twin's situational memory.
  const changed = context.onDataChanged;
  context.onDataChanged = () => { changed?.(); engine.invalidate(); };

  router.get('/overview', (_request, response) => {
    response.json({ owner: ownerState(db), sources: listSources(db), counts: counts(db) });
  });

  router.post('/import', express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (request: Request, response: Response) => {
    const raw = request.header('x-filename');
    if (!raw) return fail(response, 400, 'Λείπει το όνομα αρχείου (X-Filename).');
    let filename: string;
    try { filename = path.basename(decodeURIComponent(raw)).slice(0, 200); } catch { return fail(response, 400, 'Μη έγκυρο όνομα αρχείου.'); }
    if (!Buffer.isBuffer(request.body) || !request.body.length) return fail(response, 400, 'Το αρχείο είναι κενό.');
    try {
      const report = await importUpload(db, { name: filename, data: request.body });
      if (!report.sources.length) return fail(response, 422, `Δεν αναγνωρίστηκε υποστηριζόμενη μορφή εξαγωγής στο «${filename}».`);
      context.onDataChanged?.();
      response.json(report);
    } catch (error) {
      if (error instanceof UnsafeArchiveError) return fail(response, 422, error.message);
      // Never echo file contents; the message is safe to show.
      return fail(response, 500, `Η εισαγωγή απέτυχε: ${(error as Error).message.slice(0, 200)}`);
    }
  });

  router.post('/demo', async (_request, response) => {
    const reports = await loadDemoPersona(context);
    response.json({ imported: reports.length, overview: { owner: ownerState(db), sources: listSources(db), counts: counts(db) } });
  });

  router.post('/owner', (request, response) => {
    const ids = (request.body as { participantIds?: unknown })?.participantIds;
    if (!Array.isArray(ids) || ids.length > 20 || !ids.every(id => typeof id === 'string' && /^p_[0-9a-f]{12}$/.test(id))) return fail(response, 400, 'participantIds must be up to 20 participant ids.');
    setOwner(db, ids as string[]);
    context.onDataChanged?.();
    response.json({ owner: ownerState(db), counts: counts(db) });
  });

  router.get('/threads', (_request, response) => {
    response.json({ threads: db.prepare(`
      SELECT t.id, t.platform, t.title, t.relationship, t.relationship_source AS relationshipSource, COUNT(m.id) AS messages, SUM(m.is_owner) AS ownerMessages
      FROM threads t JOIN sources s ON s.id = t.source_id LEFT JOIN messages m ON m.thread_id = t.id
      GROUP BY t.id ORDER BY messages DESC`).all() });
  });

  router.patch('/threads/:id', (request, response) => {
    const relationship = (request.body as { relationship?: unknown })?.relationship;
    if (typeof relationship !== 'string' || !RELATIONSHIPS.has(relationship)) return fail(response, 400, 'relationship must be friend, family, study, work or unknown.');
    const changed = db.prepare("UPDATE threads SET relationship = ?, relationship_source = 'owner' WHERE id = ?").run(relationship, String(request.params.id)).changes;
    if (!changed) return fail(response, 404, 'Thread not found.');
    context.onDataChanged?.();
    response.json({ ok: true });
  });

  router.patch('/sources/:id', (request, response) => {
    const included = (request.body as { included?: unknown })?.included;
    if (typeof included !== 'boolean') return fail(response, 400, 'included must be true or false.');
    if (!setSourceIncluded(db, String(request.params.id), included)) return fail(response, 404, 'Source not found.');
    context.onDataChanged?.();
    response.json({ sources: listSources(db) });
  });

  router.delete('/sources/:id', (request, response) => {
    if (!deleteSource(db, String(request.params.id))) return fail(response, 404, 'Source not found.');
    context.onDataChanged?.();
    response.json({ sources: listSources(db), counts: counts(db) });
  });

  router.delete('/all', (_request, response) => {
    deleteEverything(db);
    context.onDataChanged?.();
    response.json({ ok: true, counts: counts(db) });
  });

  router.get('/persona', (_request, response) => {
    response.json({ owner: ownerState(db), facts: listFacts(db), style: styleProfile(db), aiAvailable: !!context.llm });
  });

  router.get('/evidence', (request, response) => {
    const ids = String(request.query.ids ?? '').split(',').filter(id => /^[md]_[0-9a-f]{16}$/.test(id));
    response.json(evidenceFor(db, ids));
  });

  router.patch('/persona/facts/:id', (request, response) => {
    const body = (request.body ?? {}) as { status?: unknown; statement?: unknown };
    const status = body.status;
    if (status !== undefined && !['auto', 'confirmed', 'rejected'].includes(String(status))) return fail(response, 400, 'status must be confirmed, rejected or auto.');
    if (body.statement !== undefined && (typeof body.statement !== 'string' || !body.statement.trim() || body.statement.length > 500)) return fail(response, 400, 'statement must be 1–500 characters.');
    if (!updateFact(db, String(request.params.id), { status: status as FactStatus | undefined, statement: (body.statement as string | undefined)?.trim() })) return fail(response, 404, 'Fact not found.');
    response.json({ facts: listFacts(db) });
  });

  router.post('/persona/facts', (request, response) => {
    const body = (request.body ?? {}) as { category?: unknown; statement?: unknown };
    if (!FACT_CATEGORIES.includes(body.category as FactCategory)) return fail(response, 400, 'Unknown category.');
    if (typeof body.statement !== 'string' || !body.statement.trim() || body.statement.length > 500) return fail(response, 400, 'statement must be 1–500 characters.');
    addOwnerFact(db, body.category as FactCategory, body.statement.trim());
    response.json({ facts: listFacts(db) });
  });

  router.post('/persona/extract', async (_request, response) => {
    if (!context.llm || !context.budget) return fail(response, 409, 'Το AI είναι σε παύση ή δεν έχει οριστεί key. Τα γεγονότα από τους δικούς μας κανόνες είναι ήδη διαθέσιμα.');
    try {
      const result = await extractFactsWithLlm(db, context.llm, context.budget);
      response.json({ ...result, facts: listFacts(db) });
    } catch (error) {
      fail(response, 502, `Η εξαγωγή με AI απέτυχε: ${(error as Error).message.slice(0, 160)}`);
    }
  });

  router.get('/studio', (_request, response) => { response.json({ inbox: STUDIO_INBOX, aiAvailable: !!context.llm }); });

  router.post('/reply', async (request, response) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!text(body.incoming, 2000)) return fail(response, 400, 'incoming must be 1–2000 characters.');
    if (!PLATFORMS.has(String(body.platform))) return fail(response, 400, 'Unknown platform.');
    if (body.relationship !== undefined && !RELATIONSHIPS.has(String(body.relationship))) return fail(response, 400, 'Unknown relationship.');
    if (body.sentAt !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(body.sentAt))) return fail(response, 400, 'sentAt must be YYYY-MM-DDTHH:MM.');
    const history = Array.isArray(body.history) ? (body.history as Array<{ author?: unknown; text?: unknown }>).slice(-10).filter(item => (item.author === 'owner' || item.author === 'contact') && text(item.text, 2000)) as Array<{ author: 'owner' | 'contact'; text: string }> : [];
    response.json(await engine.reply({
      incoming: String(body.incoming), platform: String(body.platform), relationship: body.relationship as never,
      contactName: text(body.contactName, 120) ? String(body.contactName) : undefined, history, sentAt: body.sentAt as string | undefined,
    }));
  });

  router.post('/generic', async (request, response) => {
    const incoming = (request.body as { incoming?: unknown })?.incoming;
    if (!text(incoming, 2000)) return fail(response, 400, 'incoming must be 1–2000 characters.');
    if (!context.llm) return fail(response, 409, 'Η σύγκριση με γενικό AI χρειάζεται ενεργό AI (key + AI_ENABLED=true).');
    try {
      const reply = await engine.generic(String(incoming));
      if (reply === null) return fail(response, 429, 'Όριο χρήσης AI· δοκίμασε ξανά σε λίγο.');
      response.json({ text: reply });
    } catch (error) { fail(response, 502, `Το γενικό μοντέλο δεν απάντησε: ${(error as Error).message.slice(0, 120)}`); }
  });

  router.post('/ask', async (request, response) => {
    const question = (request.body as { question?: unknown })?.question;
    if (!text(question, 500)) return fail(response, 400, 'question must be 1–500 characters.');
    response.json(await askTwin(db, engine, String(question).trim(), context.llm, context.budget));
  });

  router.post('/feedback', (request, response) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!['accepted', 'edited', 'dismissed'].includes(String(body.action))) return fail(response, 400, 'action must be accepted, edited or dismissed.');
    if (!text(body.incoming, 2000) || typeof body.suggestion !== 'string' || body.suggestion.length > 4000 || typeof body.finalText !== 'string' || body.finalText.length > 4000) return fail(response, 400, 'incoming, suggestion and finalText are required.');
    if (!PLATFORMS.has(String(body.platform))) return fail(response, 400, 'Unknown platform.');
    const relationship = RELATIONSHIPS.has(String(body.relationship)) ? String(body.relationship) : null;
    db.prepare('INSERT INTO feedback_events (created_at, platform, relationship, incoming, suggestion, final_text, action, engine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), String(body.platform), relationship, String(body.incoming), body.suggestion, body.finalText, String(body.action), typeof body.engine === 'string' ? body.engine.slice(0, 40) : null);
    engine.invalidate();
    response.json({ ok: true, events: (db.prepare('SELECT COUNT(*) AS n FROM feedback_events').get() as { n: number }).n });
  });

  return router;
}
