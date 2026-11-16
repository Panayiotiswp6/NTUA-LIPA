import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Local, single-file store for the owner's digital footprint.
 * Everything stays inside the Docker volume (DATA_DIR); nothing is sent anywhere unless AI is enabled.
 * Migrations are embedded so the bundled server needs no extra files at runtime.
 */
const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        included INTEGER NOT NULL DEFAULT 1,
        stats TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        pseudonym TEXT NOT NULL,
        is_owner INTEGER NOT NULL DEFAULT 0,
        handles TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        external_key TEXT NOT NULL,
        title TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'unknown',
        relationship_source TEXT NOT NULL DEFAULT 'auto',
        UNIQUE (platform, external_key)
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL REFERENCES participants(id),
        sent_at TEXT NOT NULL,
        text TEXT NOT NULL,
        text_redacted TEXT NOT NULL,
        lang TEXT NOT NULL,
        is_owner INTEGER NOT NULL,
        reply_to_message_id TEXT,
        hash TEXT NOT NULL UNIQUE,
        holdout INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX messages_thread ON messages(thread_id, sent_at);
      CREATE INDEX messages_owner ON messages(is_owner);
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        text_redacted TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE
      );
      CREATE TABLE persona_facts (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        statement TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'auto',
        origin TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE feedback_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        platform TEXT NOT NULL,
        relationship TEXT,
        incoming TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        final_text TEXT NOT NULL,
        action TEXT NOT NULL,
        engine TEXT
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

export type Database = DatabaseSync;

export function openDatabase(file = ':memory:'): Database {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function migrate(db: Database) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);');
  const applied = new Set((db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(row => row.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getSetting<T>(db: Database, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as T : fallback;
}

export function setSetting(db: Database, key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}
