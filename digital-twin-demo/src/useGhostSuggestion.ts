import { useEffect, useRef, useState } from 'react';
import { suggestionProvider } from './domain';
import type { Suggestion, SuggestionContext } from './domain';

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
  // A provider may be slow. A result belongs to its exact person, thread, input and history.
  const key = JSON.stringify([
    context.channel, context.contact.id, context.draft,
    context.lastIncoming?.id, context.lastIncoming?.text,
    context.history.map(message => [message.id, message.author, message.text]),
    context.sources.map(source => source.id), revision,
  ]);

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
    setState({ key, suggestion: null, loading: true });
    const timer = setTimeout(async () => {
      try {
        const result = snapshot.draft.length
          ? await suggestionProvider.autocomplete(snapshot)
          : await suggestionProvider.suggestReply(snapshot);
        if (active) setState({ key, suggestion: result, loading: false });
      } catch {
        if (active) setState({ key, suggestion: null, loading: false });
      }
    }, snapshot.draft.length ? 180 : 280);
    return () => { active = false; clearTimeout(timer); };
  }, [key, enabled, dismissed]);

  const visible = enabled && dismissed !== key && state.key === key;
  return {
    suggestion: visible ? state.suggestion : null,
    loading: visible && state.loading,
    refresh: () => { setDismissed(null); setRevision(value => value + 1); },
    dismiss: () => setDismissed(key),
  };
}
