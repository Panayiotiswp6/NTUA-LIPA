import { describe, expect, it } from 'vitest';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { openDatabase } from './db';
import { answerBlind, blindPairs, decisionOf, lexicalSimilarity, offlineFidelity } from './fidelity';
import { refreshPersona } from './persona';
import { loadDemoPersona, twinRouter } from './routes';

const sampleDir = path.resolve(import.meta.dirname, '..', '..', 'sample-data');
async function demo() {
  const db = openDatabase();
  await loadDemoPersona({ db, sampleDir });
  refreshPersona(db);
  return db;
}

describe('fidelity metrics', () => {
  it('classifies decisions and measures lexical similarity', () => {
    expect(decisionOf('σήμερα δεν μπορώ 😅 το σάββατο όμως;')).toBe('αρνείται · προτείνει Σαββατοκύριακο');
    expect(decisionOf('Σήμερα το βράδυ δεν μπορώ. Αύριο το πρωί;')).toBe('αρνείται · προτείνει πρωί');
    expect(decisionOf('ναι! πες μου ώρα 🙂')).toBe('ζητά λεπτομέρειες');
    expect(lexicalSimilarity('τέλεια! πες μου ώρα', 'τέλεια! πες μου ώρα')).toBe(1);
    expect(lexicalSimilarity('τέλεια!', 'Καλησπέρα σας')).toBeLessThan(0.2);
  });

  it('evaluates only on hold-out pairs the twin never saw, against a no-persona ablation', async () => {
    const db = await demo();
    const result = await offlineFidelity(db);
    const holdout = (db.prepare('SELECT COUNT(*) AS n FROM messages WHERE holdout = 1').get() as { n: number }).n;
    expect(result.holdout).toBe(holdout);
    expect(result.overall.twin.decision).toBeGreaterThanOrEqual(result.overall.baseline.decision);
    expect(result.overall.twin.registerAccuracy).toBeGreaterThan(0.8);
    expect(result.lastAiEval.summary.twin.relationshipAccuracy).toBe(1);
    expect(result.history.length).toBe(1);
  });

  it('runs a blind "which one did I write?" test and tracks confusion', async () => {
    const db = await demo();
    const { pairs } = await blindPairs(db);
    expect(pairs.length).toBeGreaterThan(0);
    expect(new Set(pairs[0].options).size).toBe(2);
    const real = (db.prepare('SELECT text FROM messages WHERE id = ?').get(pairs[0].id) as { text: string }).text;
    const wrong = pairs[0].options.findIndex(option => option !== real);
    const answer = await answerBlind(db, pairs[0].id, wrong);
    expect(answer).toMatchObject({ correct: false, summary: { answered: 1, fooled: 1, confusion: 1 } });
  });
});

describe('privacy API', () => {
  it('previews redaction and exports the persona without other people\'s messages', async () => {
    const db = await demo();
    const app = express();
    app.use(express.json());
    app.use('/api/twin', twinRouter({ db, sampleDir }));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/twin`;
    try {
      const preview = await (await fetch(`${base}/redact-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Η Μαρία στο 6912345678' }) })).json() as { text: string };
      expect(preview.text).toBe('Η Person_B στο [PHONE]'.replace('Person_B', preview.text.match(/Person_[A-Z]+/)![0]));
      expect(preview.text).not.toMatch(/Μαρία|691/);
      const exported = await fetch(`${base}/export`);
      expect(exported.headers.get('content-disposition')).toMatch(/attachment/);
      const body = await exported.json() as { facts: unknown[]; owner: string[] };
      expect(body.facts.length).toBeGreaterThan(5);
      expect(JSON.stringify(body)).not.toMatch(/πάμε για καφέ σήμερα/);
      const privacy = await (await fetch(`${base}/privacy`)).json() as { redactedMessages: number; aiEnabled: boolean };
      expect(privacy.aiEnabled).toBe(false);
      expect(privacy.redactedMessages).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});
