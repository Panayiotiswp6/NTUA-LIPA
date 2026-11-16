import { describe, expect, it } from 'vitest';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { UsageBudget } from '../budget';
import type { ChatRequest, LlmClient } from '../llm';
import { askTwin } from './ask';
import { openDatabase } from './db';
import { TwinEngine } from './engine';
import { refreshPersona } from './persona';
import { loadDemoPersona, twinRouter } from './routes';

const sampleDir = path.resolve(import.meta.dirname, '..', '..', 'sample-data');
async function demo() {
  const db = openDatabase();
  await loadDemoPersona({ db, sampleDir });
  refreshPersona(db);
  return db;
}

describe('offline twin', () => {
  it('follows the owner\'s decision pattern in their own words for a last-minute weekday invitation', async () => {
    const reply = await new TwinEngine(await demo()).reply({ incoming: 'πάμε για ποτό απόψε; 🍹', platform: 'whatsapp', relationship: 'friend', contactName: 'Μαρία Γεωργίου', sentAt: '2026-11-16T18:30:00' });
    expect(reply.engine).toBe('offline-twin');
    expect(reply.situations).toContain('invite_lastminute_weekday');
    expect(reply.text).toMatch(/σάββατο|σαββατοκύριακο/i);
    expect(reply.facts.some(fact => fact.category === 'decision_pattern')).toBe(true);
  });

  it('answers a Greeklish friend in Greeklish', async () => {
    const reply = await new TwinEngine(await demo()).reply({ incoming: 're pame gia mpasket twra?', platform: 'whatsapp', contactName: 'Γιώργος Καραλής', sentAt: '2026-11-17T19:05:00' });
    expect(reply.text).toMatch(/^[a-z0-9 ,.?!']+$/i);
  });

  it('abstains instead of inventing when nothing similar exists', async () => {
    const reply = await new TwinEngine(await demo()).reply({ incoming: 'ξέρεις μέχρι τι ώρα είναι ανοιχτή η βιβλιοθήκη το σάββατο;', platform: 'instagram', relationship: 'friend' });
    expect(reply).toMatchObject({ abstained: true, text: '', engine: 'abstain' });
  });

  it('never retrieves hold-out pairs and learns from approved edits', async () => {
    const db = await demo();
    const engine = new TwinEngine(db);
    const holdout = (db.prepare('SELECT id FROM messages WHERE holdout = 1').all() as Array<{ id: string }>).map(row => row.id);
    const retrieved = engine.retrieve({ incoming: 'πάμε για καφέ;', platform: 'whatsapp' }, 'friend', 30);
    expect(retrieved.some(item => holdout.includes(item.id))).toBe(false);
    db.prepare("INSERT INTO feedback_events (created_at, platform, relationship, incoming, suggestion, final_text, action) VALUES (?, 'whatsapp', 'friend', ?, '', ?, 'edited')").run('2026-11-16T10:00:00', 'θες να έρθεις στη συναυλία των Κλειδιών;', 'ουάου ναι! στείλε μου εισιτήρια 🎸');
    engine.invalidate();
    const reply = await engine.reply({ incoming: 'έρχεσαι στη συναυλία των Κλειδιών;', platform: 'whatsapp', relationship: 'friend' });
    expect(reply.text).toBe('ουάου ναι! στείλε μου εισιτήρια 🎸');
    expect(reply.exemplars[0].source).toBe('feedback');
  });
});

class FakeLlm implements LlmClient {
  readonly chatModel = 'fake-chat'; readonly embeddingModel = 'fake';
  requests: ChatRequest[] = [];
  constructor(private readonly answers: Array<Record<string, unknown>>) {}
  async chatJson<T>(request: ChatRequest) { this.requests.push(request); return { data: this.answers.shift() as T, usage: { totalTokens: 10 } }; }
  async embed() { return { vectors: [], usage: { totalTokens: 0 } }; }
}
const answer = (reply: string, extra: Record<string, unknown> = {}) => ({ reply, abstain: false, rationale: 'Χαλαρό ύφος.', usedExemplarIds: [], usedFactIds: [], confidence: 0.8, ...extra });

describe('LLM twin contract', () => {
  it('sends pseudonyms and measured style, and restores names locally', async () => {
    const db = await demo();
    const llm = new FakeLlm([answer('σήμερα δεν μπορώ 😅 το σάββατο με την Person_A;')]);
    const reply = await new TwinEngine(db, llm, new UsageBudget(100_000, 100)).reply({ incoming: 'πάμε για καφέ σήμερα;', platform: 'whatsapp', relationship: 'friend', contactName: 'Μαρία Γεωργίου', sentAt: '2026-11-16T17:00:00' });
    expect(reply.engine).toBe('twin-llm');
    expect(llm.requests[0].user).toMatch(/Measured style/);
    expect(llm.requests[0].user).not.toMatch(/Μαρία|Γιώργος|Νίκος/);
    expect(reply.text).not.toMatch(/Person_/);
  });

  it('regenerates once when the draft is off-style, then falls back to the offline twin', async () => {
    const formal = answer('Αξιότιμε κύριε, σας ευχαριστώ θερμά για την πρόσκληση, θα την εξετάσω με προσοχή και θα σας ενημερώσω το συντομότερο δυνατό σχετικά με τη διαθεσιμότητά μου.');
    const llm = new FakeLlm([formal, formal]);
    const reply = await new TwinEngine(await demo(), llm, new UsageBudget(100_000, 100)).reply({ incoming: 'πάμε για ποτό απόψε;', platform: 'whatsapp', relationship: 'friend', sentAt: '2026-11-16T18:30:00' });
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[1].user).toMatch(/rejected/);
    expect(reply.engine).toBe('offline-twin');
  });

  it('passes abstention through', async () => {
    const llm = new FakeLlm([answer('', { abstain: true, rationale: 'Δεν έχω στοιχεία.', confidence: 0.1 })]);
    const reply = await new TwinEngine(await demo(), llm, new UsageBudget(100_000, 100)).reply({ incoming: 'Θέση στο Λονδίνο;', platform: 'gmail', relationship: 'work' });
    expect(reply).toMatchObject({ abstained: true, engine: 'abstain' });
  });
});

describe('ask my twin (offline)', () => {
  it('answers about the owner with citations, and says it does not know otherwise', async () => {
    const db = await demo();
    const engine = new TwinEngine(db);
    const gym = await askTwin(db, engine, 'Πότε πάω γυμναστήριο;');
    expect(gym.answer).toMatch(/Γυμναστήριο Δευτέρα/);
    expect(gym.citations.length).toBeGreaterThan(0);
    const unknown = await askTwin(db, engine, 'Ποιο είναι το αγαπημένο μου φαγητό;');
    expect(unknown).toMatchObject({ abstained: true, citations: [] });
  });

  it('simulates a reply when asked what the owner would say', async () => {
    const db = await demo();
    const result = await askTwin(db, new TwinEngine(db), 'Τι θα απαντούσα στο «Να κάνουμε call απόψε για την εργασία;»');
    expect(result.mode).toBe('as_owner');
    expect(result.answer).toMatch(/πρωί/);
  });
});

describe('twin HTTP API', () => {
  it('validates input and records feedback', async () => {
    const db = await demo();
    const app = express();
    app.use(express.json());
    app.use('/api/twin', twinRouter({ db, sampleDir }));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/twin`;
    const post = (route: string, body: unknown) => fetch(`${base}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      expect((await post('reply', { incoming: '', platform: 'whatsapp' })).status).toBe(400);
      expect((await post('reply', { incoming: 'γεια', platform: 'fax' })).status).toBe(400);
      expect((await post('generic', { incoming: 'γεια' })).status).toBe(409);
      expect((await post('feedback', { action: 'sent', incoming: 'x', suggestion: '', finalText: '', platform: 'whatsapp' })).status).toBe(400);
      const saved = await post('feedback', { action: 'edited', incoming: 'πάμε;', suggestion: 'ναι', finalText: 'ναι! 🙂', platform: 'whatsapp', relationship: 'friend' });
      expect(await saved.json()).toMatchObject({ ok: true, events: 1 });
    } finally {
      server.close();
    }
  });
});
