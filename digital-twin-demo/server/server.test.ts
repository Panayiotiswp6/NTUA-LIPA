import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MockSourceRepository } from '../src/domain/SourceRepository';
import { initialScheduleEvents } from '../src/domain/scheduleData';
import { createApp } from './app';
import { UsageBudget } from './budget';
import { loadConfig } from './config';
import { extractTimes, guardReply } from './guard';
import type { ChatRequest, LlmClient } from './llm';
import { SuggestionService, validateRequest, type SuggestRequest } from './suggestionService';

const repository = new MockSourceRepository();

/** Deterministic stand-in for the model: answers are queued, embeddings favour shared words. */
class FakeLlm implements LlmClient {
  readonly chatModel = 'fake-chat';
  readonly embeddingModel = 'fake-embed';
  requests: ChatRequest[] = [];
  embedCalls = 0;
  constructor(private readonly answers: Array<Record<string, unknown> | Error>) {}
  async chatJson<T>(request: ChatRequest) {
    this.requests.push(request);
    const next = this.answers.shift();
    if (!next) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return { data: next as T, usage: { totalTokens: 100 } };
  }
  async embed(texts: string[]) {
    this.embedCalls++;
    const vocabulary = ['καφε', 'εργασ', 'συναντ', 'link', 'βολτα', 'ωρα'];
    const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return { vectors: texts.map(text => vocabulary.map(word => fold(text).includes(word) ? 1 : 0.01)), usage: { totalTokens: 10 } };
  }
}

function request(contactId: string, text: string, mode: SuggestRequest['mode'] = 'reply', draft = ''): SuggestRequest {
  const contact = repository.getContact(contactId)!;
  const thread = repository.getThreads(contact.channel).find(item => item.contactId === contactId)!;
  return {
    mode, channel: contact.channel, contactId, draft,
    history: [...thread.messages, { id: `incoming-${text}`, author: 'contact', text, time: '12:00' }],
    calendarEvents: initialScheduleEvents, referenceDate: '2026-11-16', meetingDurationMinutes: 60,
  };
}

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  understanding: 'Η Μαρία προτείνει καφέ.', intent: 'invitation', reply: text, usedSourceIds: ['src-ig-maria-01', 'src-other-contact'], confidence: 0.8, ...extra,
});
const service = (llm?: LlmClient, budget = new UsageBudget(1_000_000, 100)) => new SuggestionService({ repository, llm, budget });

describe('guard', () => {
  it('normalises clock times in common Greek formats', () => {
    expect([...extractTimes('στις 10, 08:45–10.30 και 22/11 ή 22.11.2026')].sort()).toEqual(['08:45', '10:00', '10:30']);
  });

  it('rejects a time that is neither in the conversation nor in the calendar evidence', () => {
    const result = guardReply({ text: 'δεν μπορώ, πάμε στις 11:15;', incoming: 'καφέ στις 10:00;', draft: '', relationship: 'friend', maxLength: 400 });
    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('11:15');
  });

  it('keeps the professor register formal', () => {
    const result = guardReply({ text: 'Καλησπέρα σας, ευχαριστώ 🙂', incoming: '', draft: '', relationship: 'professor', maxLength: 900 });
    expect(result.passed).toBe(false);
  });
});

describe('SuggestionService', () => {
  it('returns a model reply with scoped evidence, understanding and the calendar decision', async () => {
    const llm = new FakeLlm([reply('τη Δευτέρα στις 10:00 δεν μπορώ, έχω Σήματα και Συστήματα 08:45–10:30 😅')]);
    const result = await service(llm).suggest(request('ig-maria', 'πάμε για καφέ τη Δευτέρα στις 10:00;'));
    expect(result?.meta?.engine).toBe('openai');
    expect(result?.meta?.understanding).toContain('καφέ');
    expect(result?.availability?.status).toBe('conflict');
    // Evidence from another person is dropped even if the model names it.
    expect(result?.sourceIds).toEqual(['src-ig-maria-01']);
    expect(result?.meta?.retrieval?.every(item => item.id.startsWith('src-ig-maria'))).toBe(true);
    expect(llm.requests[0].user).toContain('Calendar check (authoritative)');
    expect(llm.requests[0].user).toContain('Σήματα και Συστήματα');
  });

  it('retries once with feedback, then falls back to the deterministic engine when the guard still fails', async () => {
    const invented = reply('ναι μπορώ, τα λέμε στις 11:15!');
    const llm = new FakeLlm([invented, invented]);
    const result = await service(llm).suggest(request('ig-maria', 'πάμε για καφέ τη Δευτέρα στις 10:00;'));
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[1].user).toContain('rejected');
    expect(result?.meta?.engine).toBe('deterministic');
    expect(result?.meta?.guard?.passed).toBe(false);
    expect(result?.text).toContain('Σήματα και Συστήματα');
  });

  it('accepts a corrected second attempt', async () => {
    const llm = new FakeLlm([reply('ναι, στις 11:15!'), reply('τη Δευτέρα στις 10:00 δεν μπορώ, έχω μάθημα 😅')]);
    const result = await service(llm).suggest(request('ig-maria', 'πάμε για καφέ τη Δευτέρα στις 10:00;'));
    expect(result?.meta?.engine).toBe('openai');
    expect(result?.text).toContain('δεν μπορώ');
  });

  it('falls back with a visible reason when the model errors', async () => {
    const result = await service(new FakeLlm([new Error('timeout')])).suggest(request('ig-maria', 'πάμε για καφέ τη Δευτέρα στις 10:00;'));
    expect(result?.meta?.engine).toBe('deterministic');
    expect(result?.meta?.fallbackReason).toContain('timeout');
    expect(result?.text).toBeTruthy();
  });

  it('works offline without an API key', async () => {
    const result = await service().suggest(request('gm-eleni', 'Καλησπέρα Αλέξανδρε, μπορούμε να συναντηθούμε την Τρίτη στις 16:30;'));
    expect(result?.meta?.engine).toBe('deterministic');
    expect(result?.meta?.fallbackReason).toContain('OPENAI_API_KEY');
    expect(result?.text).toMatch(/σας/);
  });

  it('never spends past the token budget', async () => {
    const llm = new FakeLlm([reply('οκ')]);
    const budget = new UsageBudget(1, 100);
    budget.record(5);
    const result = await service(llm, budget).suggest(request('ig-maria', 'πάμε για καφέ;'));
    expect(llm.requests).toHaveLength(0);
    expect(result?.meta?.fallbackReason).toContain('budget');
  });

  it('returns only the appendable suffix for autocomplete, even if the model echoes the draft', async () => {
    const llm = new FakeLlm([{ continuation: 'Ναι, το είδα, ευχαριστώ 🙂' }]);
    const result = await service(llm).suggest(request('ig-maria', 'μόλις σου έστειλα το link!', 'complete', 'Ναι'));
    expect(result?.text).toBe(', το είδα, ευχαριστώ 🙂');
    expect(llm.requests[0].reasoningEffort).toBe('none');
  });

  it('caches identical requests and reuses sample embeddings', async () => {
    const llm = new FakeLlm([reply('το είδα, ευχαριστώ 🙂', { intent: 'confirmation' })]);
    const twin = service(llm);
    const first = await twin.suggest(request('ig-maria', 'μόλις σου έστειλα το link!'));
    const second = await twin.suggest(request('ig-maria', 'μόλις σου έστειλα το link!'));
    expect(second).toEqual(first);
    expect(llm.requests).toHaveLength(1);
    expect(llm.embedCalls).toBe(2); // one batch for the samples, one for the query
  });

  it('rejects malformed requests', () => {
    expect(validateRequest({ mode: 'reply' })).toMatch(/channel/);
    expect(validateRequest({ ...request('ig-maria', 'γεια'), history: [{ id: 'x', author: 'bot', text: 'x' }] })).toMatch(/history/);
    expect(validateRequest(request('ig-maria', 'γεια'))).toBeNull();
  });
});

describe('HTTP API', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function start(llm?: LlmClient) {
    const config = { ...loadConfig({}), staticDir: undefined };
    const budget = new UsageBudget(1_000_000, 100);
    server = createApp(config, new SuggestionService({ repository, llm, budget }), budget).listen(0);
    await new Promise(resolve => server!.once('listening', resolve));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it('reports whether AI is configured without exposing secrets', async () => {
    const base = await start();
    const body = await (await fetch(`${base}/api/health`)).json() as { ai: { enabled: boolean } };
    expect(body.ai.enabled).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/sk-/);
  });

  it('serves suggestions and validates input', async () => {
    const base = await start(new FakeLlm([reply('το είδα, ευχαριστώ 🙂')]));
    const bad = await fetch(`${base}/api/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(bad.status).toBe(400);
    const good = await fetch(`${base}/api/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request('ig-maria', 'μόλις σου έστειλα το link!')) });
    expect((await good.json() as { suggestion: { meta: { engine: string } } }).suggestion.meta.engine).toBe('openai');
  });
});
