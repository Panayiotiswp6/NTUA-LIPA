import { useEffect, useRef, useState } from 'react';
import { prefixSuffix } from './domain';
import type { Suggestion, SuggestionContext } from './domain';
import { activeSuggestionProvider, getAiStatus } from './ai/provider';

interface GhostOptions {
  context: SuggestionContext;
  enabled?: boolean;
}
interface GhostState {
  key: string;
  suggestion: Suggestion | null;
  loading: boolean;
}

/** Suggestions stay in an overlay. Only the caller's explicit accept action edits the draft. */
export function useGhostSuggestion({ context, enabled = true }: GhostOptions) {
  const [revision, setRevision] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [state, setState] = useState<GhostState>({ key: '', suggestion: null, loading: false });
  const latest = useRef(context);
  latest.current = context;
  // The last full AI reply for this exact conversation state; typing along it needs no new model call.
  const lastFull = useRef<{ base: string; suggestion: Suggestion } | null>(null);
  // A provider may be slow. A result belongs to its exact person, thread, input and history.
  const base = JSON.stringify([
    context.channel, context.contact.id,
    context.lastIncoming?.id, context.lastIncoming?.text,
    context.history.map(message => [message.id, message.author, message.text]),
    context.sources.map(source => source.id), context.calendarEvents,
    context.referenceDate, context.meetingDurationMinutes, revision,
  ]);
  const key = JSON.stringify([base, context.draft]);

  // Escape only dismisses the current editing state, not a phrase forever.
  useEffect(() => { setDismissed(null); }, [key]);

  useEffect(() => {
    if (!enabled || dismissed === key) return;
    let active = true;
    const snapshot = latest.current;
    const lastMessage = snapshot.history.at(-1);
    // After sending, wait for another incoming message before offering a new reply.
    if (!snapshot.lastIncoming || (lastMessage?.author === 'owner' && !snapshot.draft.length)) {
      setState({ key, suggestion: null, loading: false });
      return;
    }
    const full = lastFull.current;
    if (snapshot.draft.length && full?.base === base && full.suggestion.meta?.engine === 'openai') {
      const suffix = prefixSuffix(full.suggestion.text, snapshot.draft);
      if (suffix?.trim()) {
        setState({ key, suggestion: { ...full.suggestion, text: suffix }, loading: false });
        return;
      }
    }
    setState({ key, suggestion: null, loading: true });
    // A network model deserves a slightly longer pause so each keystroke does not cost a request.
    const remote = getAiStatus().state === 'online';
    const delay = snapshot.draft.length ? (remote ? 450 : 180) : (remote ? 250 : 280);
    const timer = setTimeout(async () => {
      try {
        const result = snapshot.draft.length
          ? await activeSuggestionProvider.autocomplete(snapshot)
          : await activeSuggestionProvider.suggestReply(snapshot);
        if (!active) return;
        if (!snapshot.draft.length && result) lastFull.current = { base, suggestion: result };
        setState({ key, suggestion: result, loading: false });
      } catch {
        if (active) setState({ key, suggestion: null, loading: false });
      }
    }, delay);
    return () => { active = false; clearTimeout(timer); };
  }, [key, base, enabled, dismissed]);

  const visible = enabled && dismissed !== key && state.key === key;
  return {
    suggestion: visible ? state.suggestion : null,
    loading: visible && state.loading,
    refresh: () => { setDismissed(null); setRevision(value => value + 1); },
    dismiss: () => setDismissed(key),
  };
}
