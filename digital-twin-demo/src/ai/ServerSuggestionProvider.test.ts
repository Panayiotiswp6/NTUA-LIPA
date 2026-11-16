import { describe, expect, it, vi } from 'vitest';
import { MockSuggestionProvider, sourceRepository } from '../domain';
import type { Suggestion, SuggestionContext } from '../domain';
import { ServerSuggestionProvider } from './ServerSuggestionProvider';

const contact = sourceRepository.getContact('ig-maria')!;
const incoming = { id: 'm1', author: 'contact' as const, text: 'μόλις σου έστειλα το link!', time: '12:00' };
const context: SuggestionContext = { channel: 'instagram', contact, history: [incoming], lastIncoming: incoming, draft: '', sources: sourceRepository.getSources('ig-maria') };

describe('ServerSuggestionProvider', () => {
  it('sends conversation state but no profile, samples or secrets, and returns the server suggestion', async () => {
    const suggestion: Suggestion = { text: 'το είδα 🙂', sourceIds: ['src-ig-maria-04'], traits: [], intent: 'confirmation', meta: { engine: 'openai', model: 'm' } };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ suggestion }), { status: 200 }));
    const provider = new ServerSuggestionProvider({ fallback: new MockSuggestionProvider(), fetchImpl });
    expect(await provider.suggestReply(context)).toEqual(suggestion);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ mode: 'reply', contactId: 'ig-maria', channel: 'instagram' });
    expect(body.sources).toBeUndefined();
    expect(body.contact).toBeUndefined();
  });

  it('falls back to the deterministic provider on a server error', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const provider = new ServerSuggestionProvider({ fallback: new MockSuggestionProvider(), fetchImpl });
    const result = await provider.suggestReply(context);
    expect(result?.text).toBeTruthy();
    expect(result?.meta).toMatchObject({ engine: 'deterministic' });
    expect(result?.meta?.fallbackReason).toContain('HTTP 500');
  });
});
