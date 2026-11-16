import { createHash } from 'node:crypto';
import { MockSuggestionProvider, detectIntent } from '../src/domain/MockSuggestionProvider';
import { resolveAvailability } from '../src/domain/schedule';
import { DEFAULT_REFERENCE_DATE } from '../src/domain/scheduleData';
import type { AvailabilityResult, ScheduleEvent } from '../src/domain/scheduleTypes';
import type { Channel, Intent, Message, SourceRepository, Suggestion, SuggestionContext, SuggestionMeta } from '../src/domain/types';
import type { UsageBudget } from './budget';
import { guardReply, type GuardResult } from './guard';
import type { LlmClient } from './llm';
import { COMPLETION_SCHEMA, INTENTS, REPLY_SCHEMA, SYSTEM_PROMPT, buildContextPrompt, completionInstruction, replyInstruction } from './prompts';
import { StyleRetriever, type RetrievedSample } from './retrieval';

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

/** What the browser sends. Contact profile and writing samples are resolved on the server from its repository. */
export interface SuggestRequest {
  mode: 'reply' | 'complete';
  channel: Channel;
  contactId: string;
  history: Message[];
  draft: string;
  calendarEvents?: ScheduleEvent[];
  referenceDate?: string;
  meetingDurationMinutes?: number;
}

const limits = { messages: 80, text: 4000, events: 300 };
const isString = (value: unknown, max = limits.text): value is string => typeof value === 'string' && value.length <= max;

/** Returns a human-readable problem, or null when the request is well-formed. */
export function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object.';
  const request = body as Partial<SuggestRequest>;
  if (request.mode !== 'reply' && request.mode !== 'complete') return 'mode must be "reply" or "complete".';
  if (request.channel !== 'instagram' && request.channel !== 'gmail') return 'channel must be "instagram" or "gmail".';
  if (!isString(request.contactId, 100)) return 'contactId is required.';
  if (!isString(request.draft)) return 'draft must be a string.';
  if (!Array.isArray(request.history) || request.history.length > limits.messages) return `history must be an array of at most ${limits.messages} messages.`;
  for (const message of request.history) {
    if (!message || !isString(message.id, 200) || !isString(message.text) || (message.author !== 'owner' && message.author !== 'contact')) return 'history contains an invalid message.';
  }
  if (request.calendarEvents !== undefined) {
    if (!Array.isArray(request.calendarEvents) || request.calendarEvents.length > limits.events) return 'calendarEvents must be an array.';
    for (const event of request.calendarEvents) {
      if (!event || !isString(event.id, 200) || !isString(event.title, 300) || !isString(event.start, 5) || !isString(event.end, 5)) return 'calendarEvents contains an invalid event.';
    }
  }
  if (request.referenceDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(request.referenceDate))) return 'referenceDate must be YYYY-MM-DD.';
  return null;
}

interface ReplyOutput { understanding: string; intent: string; reply: string; usedSourceIds: string[]; confidence: number }
interface CompletionOutput { continuation: string }

export interface SuggestionServiceOptions {
  repository: SourceRepository;
  llm?: LlmClient;
  budget: UsageBudget;
  now?: () => number;
  /** Shown to the user when there is no model, e.g. while AI is paused. */
  disabledReason?: string;
}

/**
 * Hybrid digital self: deterministic rules decide facts (calendar, evidence scope),
 * the language model understands the message and writes in the owner's voice,
 * and deterministic guards decide whether the model's text may be shown.
 */
export class SuggestionService {
  private readonly fallback = new MockSuggestionProvider();
  private readonly retriever?: StyleRetriever;
  private readonly cache = new Map<string, Suggestion | null>();
  private readonly now: () => number;

  constructor(private readonly options: SuggestionServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    if (options.llm) {
      const samples = options.repository.getContacts().flatMap(contact => options.repository.getSources(contact.id));
      this.retriever = new StyleRetriever(options.llm, options.budget, samples);
    }
  }

  get aiEnabled() { return !!this.options.llm; }

  buildContext(request: SuggestRequest): SuggestionContext | null {
    const contact = this.options.repository.getContact(request.contactId);
    if (!contact || contact.channel !== request.channel) return null;
    const lastIncoming = [...request.history].reverse().find(message => message.author === 'contact');
    return {
      channel: request.channel,
      contact,
      history: request.history,
      lastIncoming,
      draft: request.draft,
      sources: this.options.repository.getSources(contact.id),
      calendarEvents: request.calendarEvents,
      referenceDate: request.referenceDate || DEFAULT_REFERENCE_DATE,
      meetingDurationMinutes: request.meetingDurationMinutes || 60,
    };
  }

  private availabilityFor(context: SuggestionContext): AvailabilityResult | undefined {
    if (!context.calendarEvents || !context.lastIncoming?.text.trim()) return undefined;
    const result = resolveAvailability(context.lastIncoming.text, context.referenceDate || DEFAULT_REFERENCE_DATE, context.calendarEvents, context.meetingDurationMinutes || 60);
    return result.status === 'not_scheduling' ? undefined : result;
  }

  private async deterministic(request: SuggestRequest, context: SuggestionContext, meta: Partial<SuggestionMeta>, started: number): Promise<Suggestion | null> {
    const result = request.mode === 'reply' ? await this.fallback.suggestReply(context) : await this.fallback.autocomplete(context);
    return result && { ...result, meta: { engine: 'deterministic', ...meta, latencyMs: this.now() - started } };
  }

  private async retrieve(context: SuggestionContext): Promise<{ samples: RetrievedSample[]; error?: string }> {
    const query = [context.lastIncoming?.text, ...context.history.slice(-3).map(message => message.text)].filter(Boolean).join('\n');
    try {
      return { samples: await this.retriever!.retrieve(query, context.contact.id, context.channel, new Set(context.sources.map(sample => sample.id)), 3) };
    } catch (error) {
      // Retrieval is an enhancement; without it the twin still uses same-intent samples of the same contact.
      const intent = detectIntent(context.lastIncoming?.text ?? '');
      const sameIntent = context.sources.filter(sample => sample.intent === intent);
      const samples = (sameIntent.length ? sameIntent : context.sources).slice(0, 3).map(sample => ({ sample, score: 0 }));
      return { samples, error: (error as Error).message };
    }
  }

  async suggest(request: SuggestRequest): Promise<Suggestion | null> {
    const started = this.now();
    const context = this.buildContext(request);
    if (!context) throw new Error('Unknown contact for this channel.');
    if (!context.lastIncoming?.text.trim()) return null;
    if (request.mode === 'complete' && !request.draft.trim()) return null;
    if (!this.options.llm) return this.deterministic(request, context, { fallbackReason: this.options.disabledReason ?? 'Δεν έχει οριστεί OPENAI_API_KEY· απαντούν οι deterministic κανόνες.' }, started);

    const key = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    if (this.cache.has(key)) return this.cache.get(key)!;

    const blocked = this.options.budget.acquire();
    if (blocked) {
      const reason = blocked === 'rate-limited' ? 'Όριο αιτημάτων ανά λεπτό· απάντησαν οι deterministic κανόνες.' : 'Εξαντλήθηκε το token budget· απάντησαν οι deterministic κανόνες.';
      return this.deterministic(request, context, { fallbackReason: reason }, started);
    }

    try {
      const result = request.mode === 'reply'
        ? await this.reply(request, context, started)
        : await this.complete(request, context, started);
      if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, result);
      return result;
    } catch (error) {
      return this.deterministic(request, context, { fallbackReason: `Το μοντέλο δεν απάντησε (${(error as Error).message.slice(0, 160)}).` }, started);
    }
  }

  private guard(context: SuggestionContext, text: string, availability?: AvailabilityResult): GuardResult {
    return guardReply({
      text,
      incoming: context.history.map(message => message.text).join('\n'),
      draft: context.draft,
      relationship: context.contact.relationship,
      availability,
      maxLength: context.channel === 'gmail' ? 900 : 400,
    });
  }

  private evidence(context: SuggestionContext, retrieved: RetrievedSample[], used: string[]) {
    const allowed = new Set(retrieved.map(item => item.sample.id));
    const ids = used.filter(id => allowed.has(id));
    const sourceIds = ids.length ? ids : retrieved.slice(0, 2).map(item => item.sample.id);
    const traits = [...new Set(context.sources.filter(sample => sourceIds.includes(sample.id)).flatMap(sample => sample.traits))];
    return { sourceIds, traits: traits.length ? traits : [...context.contact.style] };
  }

  private async reply(request: SuggestRequest, context: SuggestionContext, started: number): Promise<Suggestion | null> {
    const llm = this.options.llm!;
    const availability = this.availabilityFor(context);
    const { samples, error: retrievalError } = await this.retrieve(context);
    const base = buildContextPrompt(this.options.repository.getPersona(), context, samples, availability);

    let feedback: string[] | undefined;
    let guard: GuardResult | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0 && this.options.budget.acquire()) break;
      const { data, usage } = await llm.chatJson<ReplyOutput>({ system: SYSTEM_PROMPT, user: base + replyInstruction(feedback), schema: REPLY_SCHEMA, maxTokens: 1200 });
      this.options.budget.record(usage.totalTokens);
      const text = (data.reply ?? '').trim().replace(/^["«“]|["»”]$/g, '');
      guard = this.guard(context, text, availability);
      if (guard.passed) {
        const intent: Intent = INTENTS.includes(data.intent as Intent) ? data.intent as Intent : 'unknown';
        return {
          text, intent, availability,
          ...this.evidence(context, samples, data.usedSourceIds ?? []),
          meta: {
            engine: 'openai', model: llm.chatModel,
            understanding: data.understanding?.trim() || undefined,
            retrieval: samples.map(item => ({ id: item.sample.id, score: Number(item.score.toFixed(3)) })),
            guard, latencyMs: this.now() - started,
            ...(retrievalError ? { fallbackReason: `Semantic retrieval μη διαθέσιμο (${retrievalError}).` } : {}),
          },
        };
      }
      feedback = guard.issues;
    }
    return this.deterministic(request, context, { guard, fallbackReason: 'Οι έλεγχοι ασφαλείας απέρριψαν την πρόταση του μοντέλου· απάντησαν οι deterministic κανόνες.' }, started);
  }

  private async complete(request: SuggestRequest, context: SuggestionContext, started: number): Promise<Suggestion | null> {
    const llm = this.options.llm!;
    const availability = this.availabilityFor(context);
    const { samples } = await this.retrieve(context);
    const prompt = buildContextPrompt(this.options.repository.getPersona(), context, samples, availability) + completionInstruction(request.draft);
    const { data, usage } = await llm.chatJson<CompletionOutput>({ system: SYSTEM_PROMPT, user: prompt, schema: COMPLETION_SCHEMA, maxTokens: 300, reasoningEffort: 'none' });
    this.options.budget.record(usage.totalTokens);
    let suffix = data.continuation ?? '';
    // Models sometimes echo the typed text; only the new part may be offered.
    if (fold(suffix).startsWith(fold(request.draft))) suffix = suffix.slice(request.draft.length);
    if (/\s$/.test(request.draft)) suffix = suffix.replace(/^\s+/, '');
    suffix = suffix.replace(/\s+$/, '').slice(0, 300);
    if (!suffix.trim()) return null;
    const guard = this.guard(context, request.draft + suffix, availability);
    if (!guard.passed) return this.deterministic(request, context, { guard, fallbackReason: 'Οι έλεγχοι ασφαλείας απέρριψαν τη συνέχεια του μοντέλου.' }, started);
    return {
      text: suffix,
      intent: detectIntent(context.lastIncoming?.text ?? ''),
      availability,
      ...this.evidence(context, samples, []),
      meta: {
        engine: 'openai', model: llm.chatModel, guard,
        retrieval: samples.map(item => ({ id: item.sample.id, score: Number(item.score.toFixed(3)) })),
        latencyMs: this.now() - started,
      },
    };
  }
}
