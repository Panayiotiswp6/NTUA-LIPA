import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { UsageBudget } from '../budget';
import type { ChatRequest, LlmClient } from '../llm';
import { openDatabase } from './db';
import { extractFactsWithLlm, listFacts, refreshPersona, styleProfile, updateFact } from './persona';
import { loadDemoPersona } from './routes';
import { computeMetrics, styleScore, type OwnerMessage } from './style';

const sampleDir = path.resolve(import.meta.dirname, '..', '..', 'sample-data');
async function demo() {
  const db = openDatabase();
  await loadDemoPersona({ db, sampleDir });
  refreshPersona(db);
  return db;
}
const message = (text: string, lang: OwnerMessage['lang'] = 'el'): OwnerMessage => ({ id: text, text, sentAt: '2026-11-16T10:00:00', lang, platform: 'whatsapp', relationship: 'friend', threadId: 't' });

describe('style metrics', () => {
  it('measures length, emoji, capitalisation, formality and catchphrases', () => {
    const metrics = computeMetrics(['τέλεια! πες μου ώρα 🙂', 'ναι! πες μου ώρα 🙂', 'οκ πες μου ώρα', 'Καλησπέρα σας, θα μπορούσατε;'].map(text => message(text)));
    expect(metrics.messages).toBe(4);
    expect(metrics.emojiRate).toBe(0.5);
    expect(metrics.capitalizedStart).toBe(0.25);
    expect(metrics.formality).toBe(0.25);
    expect(metrics.catchphrases[0].phrase).toBe('πες μου ώρα');
  });

  it('scores a candidate against a register', () => {
    const casual = computeMetrics(Array.from({ length: 10 }, (_, index) => message(`τέλεια! πες μου ${index} 🙂`)));
    expect(styleScore('τέλεια! πες μου 🙂', casual).score).toBeGreaterThan(styleScore('Καλησπέρα σας, θα μπορούσατε να μου στείλετε τις λεπτομέρειες της συνάντησης;', casual).score);
    expect(styleScore('Καλησπέρα σας, θα μπορούσατε να μου στείλετε τις λεπτομέρειες;', casual).notes.join(' ')).toMatch(/επίσημο|emoji|κεφαλαίο/);
  });
});

describe('persona from the demo footprint (no AI)', () => {
  it('rediscovers the planted decision pattern with evidence', async () => {
    const db = await demo();
    const fact = listFacts(db).find(item => item.statement.startsWith('Όταν τον καλούν για έξοδο τελευταία στιγμή'));
    expect(fact?.statement).toMatch(/αρνείται και προτείνει το Σαββατοκύριακο/);
    expect(fact?.evidence.length).toBeGreaterThan(3);
    expect(fact?.origin).toBe('rules');
  });

  it('separates registers: casual with friends, formal at work, Greeklish with one friend', async () => {
    const db = await demo();
    const style = styleProfile(db)!;
    expect(style.byRelationship.friend!.emojiRate).toBeGreaterThan(0.5);
    expect(style.byRelationship.work!.formality).toBeGreaterThan(0.8);
    expect(style.byRelationship.work!.emojiRate).toBe(0);
    expect(listFacts(db).some(item => item.category === 'relationship' && /greeklish/.test(item.statement))).toBe(true);
  });

  it('keeps the owner\'s decisions across refreshes and never revives rejected facts', async () => {
    const db = await demo();
    const [first, second] = listFacts(db);
    updateFact(db, first.id, { status: 'rejected' });
    updateFact(db, second.id, { statement: 'Διορθωμένο από τον ιδιοκτήτη.' });
    refreshPersona(db);
    const facts = listFacts(db);
    expect(facts.find(item => item.id === first.id)?.status).toBe('rejected');
    expect(facts.find(item => item.id === second.id)).toMatchObject({ status: 'edited', statement: 'Διορθωμένο από τον ιδιοκτήτη.' });
  });
});

describe('LLM fact extraction contract', () => {
  class FakeLlm implements LlmClient {
    readonly chatModel = 'fake'; readonly embeddingModel = 'fake';
    requests: ChatRequest[] = [];
    async chatJson<T>(request: ChatRequest) {
      this.requests.push(request);
      const ids = [...request.user.matchAll(/\[(m_[0-9a-f]{16})\]/g)].map(match => match[1]);
      return { data: { facts: [
        { category: 'knowledge', statement: 'Γράφει κώδικα σε Python.', confidence: 0.8, evidence: [ids[0], 'm_doesnotexist0000'] },
        { category: 'preference', statement: 'Χωρίς αποδείξεις.', confidence: 0.9, evidence: ['m_doesnotexist0000'] },
      ] } as T, usage: { totalTokens: 50 } };
    }
    async embed() { return { vectors: [], usage: { totalTokens: 0 } }; }
  }

  it('sends only redacted text and keeps only facts with real evidence', async () => {
    const db = await demo();
    const llm = new FakeLlm();
    const result = await extractFactsWithLlm(db, llm, new UsageBudget(100_000, 100), { maxBatches: 1 });
    expect(result.added).toBe(1);
    expect(llm.requests[0].user).not.toMatch(/Μαρία|Γιώργος|Νίκος|Ελένη/);
    const fact = listFacts(db).find(item => item.origin === 'llm')!;
    expect(fact.statement).toBe('Γράφει κώδικα σε Python.');
    expect(fact.evidence).toHaveLength(1);
  });
});
