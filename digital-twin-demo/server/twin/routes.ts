import express, { type Request, type Response } from 'express';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Database } from './db';
import { setSetting } from './db';
import { MAX_UPLOAD_BYTES } from './importers';
import { UnsafeArchiveError } from './importers/zip';
import { deleteEverything, deleteSource, importUpload, listSources, ownerState, setOwner, setSourceIncluded } from './ingest';

export interface TwinContext {
  db: Database;
  sampleDir: string;
  /** Called after any data change so derived models (style, persona) can refresh. */
  onDataChanged?: () => void;
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

export function twinRouter(context: TwinContext) {
  const router = express.Router();
  const { db } = context;

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

  return router;
}
