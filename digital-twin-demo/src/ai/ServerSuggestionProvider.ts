import type { Suggestion, SuggestionContext, SuggestionProvider } from '../domain/types';

export interface ServerProviderOptions {
  /** Relative to the page, so the app also works when hosted under a sub-path. */
  endpoint?: string;
  fallback: SuggestionProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Calls the Digital Self server. The browser never holds an API key: it sends the conversation state,
 * the server resolves the contact profile and writing samples from its own repository.
 * Any network or server failure falls back to the deterministic provider so the demo never breaks.
 */
export class ServerSuggestionProvider implements SuggestionProvider {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ServerProviderOptions) {
    this.endpoint = options.endpoint ?? 'api/suggest';
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.timeoutMs = options.timeoutMs ?? 25_000;
  }

  suggestReply(context: SuggestionContext) { return this.request('reply', context); }
  autocomplete(context: SuggestionContext) { return this.request('complete', context); }

  private async request(mode: 'reply' | 'complete', context: SuggestionContext): Promise<Suggestion | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          channel: context.channel,
          contactId: context.contact.id,
          history: context.history,
          draft: context.draft,
          calendarEvents: context.calendarEvents,
          referenceDate: context.referenceDate,
          meetingDurationMinutes: context.meetingDurationMinutes,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { suggestion: Suggestion | null };
      return body.suggestion ?? null;
    } catch (error) {
      const fallback = mode === 'reply' ? await this.options.fallback.suggestReply(context) : await this.options.fallback.autocomplete(context);
      return fallback && { ...fallback, meta: { engine: 'deterministic', fallbackReason: `Ο server δεν ήταν διαθέσιμος (${(error as Error).name === 'AbortError' ? 'timeout' : (error as Error).message}).` } };
    } finally {
      clearTimeout(timer);
    }
  }
}
