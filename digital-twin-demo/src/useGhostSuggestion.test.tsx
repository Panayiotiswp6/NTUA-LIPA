// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceRepository, suggestionProvider } from './domain';
import type { Suggestion, SuggestionContext } from './domain';
import { useGhostSuggestion } from './useGhostSuggestion';

function context(contactId = 'ig-maria', draft = '', incomingText?: string): SuggestionContext {
  const contact = sourceRepository.getContact(contactId)!;
  const thread = sourceRepository.getThreads(contact.channel).find(t => t.contactId === contactId)!;
  const history = incomingText
    ? [...thread.messages, { id: `test-${incomingText}`, author: 'contact' as const, text: incomingText, time: '12:50' }]
    : thread.messages;
  return { channel: contact.channel, contact, history, lastIncoming: [...history].reverse().find(m => m.author === 'contact'), draft, sources: sourceRepository.getSources(contactId) };
}
const fixture = (text: string): Suggestion => ({ text, sourceIds: ['src-ig-maria-01'], traits: ['χαλαρό'], intent: 'invitation' });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useGhostSuggestion', () => {
  it('automatically suggests a full reply for an empty draft, then a suffix for typed text', async () => {
    const full = vi.spyOn(suggestionProvider, 'suggestReply').mockResolvedValue(fixture('πες μου λεπτομέρειες 🙂'));
    const suffix = vi.spyOn(suggestionProvider, 'autocomplete').mockResolvedValue(fixture(', πες μου λεπτομέρειες 🙂'));
    const { result, rerender } = renderHook(({ current }) => useGhostSuggestion({ context: current, enabled: true }), { initialProps: { current: context() } });
    await waitFor(() => expect(result.current.suggestion?.text).toBe('πες μου λεπτομέρειες 🙂'));
    expect(full).toHaveBeenCalled();
    expect(suffix).not.toHaveBeenCalled();
    rerender({ current: context('ig-maria', 'Ναι') });
    await waitFor(() => expect(result.current.suggestion?.text).toBe(', πες μου λεπτομέρειες 🙂'));
    expect(suffix).toHaveBeenLastCalledWith(expect.objectContaining({ draft: 'Ναι' }));
  });

  it('keeps Escape dismissed for unchanged input and recomputes for new input or incoming message', async () => {
    const full = vi.spyOn(suggestionProvider, 'suggestReply').mockResolvedValue(fixture('πες μου λεπτομέρειες 🙂'));
    const suffix = vi.spyOn(suggestionProvider, 'autocomplete').mockResolvedValue(fixture(', πες μου λεπτομέρειες 🙂'));
    const { result, rerender } = renderHook(({ current }) => useGhostSuggestion({ context: current, enabled: true }), { initialProps: { current: context() } });
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.suggestion).toBeNull();
    rerender({ current: context() });
    expect(result.current.suggestion).toBeNull();
    expect(full).toHaveBeenCalledTimes(1);
    rerender({ current: context('ig-maria', 'Ναι') });
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(suffix).toHaveBeenCalled();
    act(() => result.current.dismiss());
    rerender({ current: context('ig-maria', 'Ναι', 'πάμε σινεμά;') });
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(suffix).toHaveBeenLastCalledWith(expect.objectContaining({ lastIncoming: expect.objectContaining({ text: 'πάμε σινεμά;' }) }));
  });

  it('can suggest the same prefix again after an intervening edit', async () => {
    const autocomplete = vi.spyOn(suggestionProvider, 'autocomplete').mockResolvedValue(fixture(', πες μου λεπτομέρειες'));
    const { result, rerender } = renderHook(({ current }) => useGhostSuggestion({ context: current, enabled: true }), { initialProps: { current: context('ig-maria', 'Ναι') } });
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.suggestion).toBeNull();
    rerender({ current: context('ig-maria', 'Ν') });
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    rerender({ current: context('ig-maria', 'Ναι') });
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(autocomplete).toHaveBeenLastCalledWith(expect.objectContaining({ draft: 'Ναι' }));
  });

  it('waits for a new incoming message after send while still completing typed drafts', async () => {
    const full = vi.spyOn(suggestionProvider, 'suggestReply').mockResolvedValue(fixture('unused full reply'));
    const suffix = vi.spyOn(suggestionProvider, 'autocomplete').mockResolvedValue(fixture(', πες μου'));
    const sent = context();
    sent.history = [...sent.history, { id: 'sent-test', author: 'owner', text: 'η απάντησή μου', time: '12:51' }];
    const { result, rerender } = renderHook(({ current }) => useGhostSuggestion({ context: current, enabled: true }), { initialProps: { current: sent } });
    expect(result.current.suggestion).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(full).not.toHaveBeenCalled();
    rerender({ current: { ...sent, draft: 'Ναι' } });
    await waitFor(() => expect(result.current.suggestion?.text).toBe(', πες μου'));
    expect(suffix).toHaveBeenCalled();
  });

  it('allows manually refreshing after the same suggestion was dismissed', async () => {
    const suggest = vi.spyOn(suggestionProvider, 'suggestReply').mockResolvedValue(fixture('πες μου λεπτομέρειες 🙂'));
    const { result } = renderHook(() => useGhostSuggestion({ context: context(), enabled: true }));
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.suggestion).toBeNull();
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(suggest).toHaveBeenCalledTimes(2);
  });

  it('ignores stale async replies when the active contact changes', async () => {
    const old = deferred<Suggestion | null>();
    const fresh = fixture('Καλησπέρα σας, σας ευχαριστώ.');
    vi.spyOn(suggestionProvider, 'suggestReply').mockImplementation(c => c.contact.id === 'ig-maria' ? old.promise : Promise.resolve(fresh));
    const { result, rerender } = renderHook(({ current }) => useGhostSuggestion({ context: current, enabled: true }), { initialProps: { current: context() } });
    await waitFor(() => expect(suggestionProvider.suggestReply).toHaveBeenCalled());
    rerender({ current: context('gm-eleni') });
    await waitFor(() => expect(result.current.suggestion?.text).toBe(fresh.text));
    await act(async () => { old.resolve(fixture('STALE FRIEND REPLY')); await old.promise; });
    expect(result.current.suggestion?.text).toBe(fresh.text);
  });

  it('clears pending work when suggestions are disabled', async () => {
    const pending = deferred<Suggestion | null>();
    const suggest = vi.spyOn(suggestionProvider, 'suggestReply').mockReturnValue(pending.promise);
    const current = context();
    const { result, rerender } = renderHook(({ enabled }) => useGhostSuggestion({ context: current, enabled }), { initialProps: { enabled: true } });
    await waitFor(() => expect(suggest).toHaveBeenCalled());
    rerender({ enabled: false });
    await act(async () => { pending.resolve(fixture('STALE REPLY')); await pending.promise; });
    expect(result.current.suggestion).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
