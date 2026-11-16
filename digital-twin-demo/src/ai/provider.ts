import { useSyncExternalStore } from 'react';
import { suggestionProvider as deterministicProvider } from '../domain';
import type { SuggestionContext, SuggestionProvider } from '../domain/types';
import { ServerSuggestionProvider } from './ServerSuggestionProvider';

export type ProviderMode = 'auto' | 'server' | 'mock';
export interface AiStatus {
  state: 'checking' | 'online' | 'offline';
  model?: string;
  embeddingModel?: string;
  reason?: string;
  /** The server has AI deliberately paused to protect the API allowance. */
  paused?: boolean;
}

/**
 * Non-secret build setting. 'auto' asks the server whether AI is configured and otherwise
 * uses the deterministic engine in the browser (e.g. the static GitHub Pages build).
 */
const configured = import.meta.env.VITE_SUGGESTION_PROVIDER as ProviderMode | undefined;
export const providerMode: ProviderMode = configured === 'server' || configured === 'mock' || configured === 'auto'
  ? configured
  : import.meta.env.MODE === 'test' ? 'mock' : 'auto';

let status: AiStatus = providerMode === 'mock'
  ? { state: 'offline', reason: 'Deterministic λειτουργία (χωρίς AI).' }
  : { state: 'checking' };
const listeners = new Set<() => void>();
const setStatus = (next: AiStatus) => { status = next; listeners.forEach(listener => listener()); };

// Delegates at call time so tests can spy on the deterministic singleton.
const deterministic: SuggestionProvider = {
  suggestReply: context => deterministicProvider.suggestReply(context),
  autocomplete: context => deterministicProvider.autocomplete(context),
};
const server = new ServerSuggestionProvider({ fallback: deterministic });

let health: Promise<void> | undefined;
export function checkAiHealth(): Promise<void> {
  if (providerMode === 'mock') return Promise.resolve();
  health ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('api/health', { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { ai?: { enabled?: boolean; paused?: boolean; model?: string; embeddingModel?: string } };
      setStatus(body.ai?.enabled
        ? { state: 'online', model: body.ai.model, embeddingModel: body.ai.embeddingModel }
        : { state: 'offline', paused: !!body.ai?.paused, reason: body.ai?.paused ? 'Το AI είναι σε παύση· απαντούν οι deterministic κανόνες.' : 'Ο server τρέχει χωρίς OPENAI_API_KEY· απαντούν οι deterministic κανόνες.' });
    } catch {
      setStatus(providerMode === 'server'
        ? { state: 'online', reason: 'Ο server δεν απάντησε στο health check.' }
        : { state: 'offline', reason: 'Δεν βρέθηκε server· απαντούν οι deterministic κανόνες στον browser.' });
    } finally {
      clearTimeout(timer);
    }
  })();
  return health;
}

async function current(): Promise<SuggestionProvider> {
  if (providerMode === 'mock') return deterministic;
  await checkAiHealth();
  return status.state === 'online' ? server : deterministic;
}

/** The provider the UI uses. Same contract as every other SuggestionProvider. */
export const activeSuggestionProvider: SuggestionProvider = {
  suggestReply: async (context: SuggestionContext) => (await current()).suggestReply(context),
  autocomplete: async (context: SuggestionContext) => (await current()).autocomplete(context),
};

export function getAiStatus() { return status; }
export function useAiStatus(): AiStatus {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, getAiStatus, getAiStatus);
}
