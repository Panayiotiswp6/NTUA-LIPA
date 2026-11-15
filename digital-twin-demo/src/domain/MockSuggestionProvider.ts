import type { Intent, SourceSample, Suggestion, SuggestionContext, SuggestionProvider } from './types';

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el').trim();

export function detectIntent(text: string): Intent {
  const normalized = fold(text);
  if (/εργασ|ασκηση|ασκησ|εκφωνηση|αλγοριθ|κωδικ|παραδοτ|ερωτημα|project|assignment/.test(normalized)) return 'assignment';
  if (/συναντ|να βρεθ|να τα πουμε|ραντεβου|συζητηση|meeting/.test(normalized)) return 'meeting';
  if (/καφε|καφεδακ|σινεμα|βoλτα|βολτα|παμε|προσκλη|συμμετ|ερθεις|ερθετε|θες να|θελεις να/.test(normalized)) return 'invitation';
  if (/επιβεβαι|ενημερω|ανεβασ|αναρτη|σου εστειλ|σας εστειλ|εστειλα|το link|το λινκ|οκ\b|ενταξει|ευχαριστ|ελαβα|ετοιμο/.test(normalized)) return 'confirmation';
  return 'unknown';
}

function incoming(context: SuggestionContext) {
  return context.lastIncoming ?? [...context.history].reverse().find(message => message.author === 'contact');
}

function intentFor(context: SuggestionContext): Intent {
  const text = incoming(context)?.text ?? '';
  const direct = detectIntent(text);
  if (direct !== 'unknown') return direct;
  // Use history only for a follow-up that actually refers to a previous message.
  if (/δευτερ|τριτ|σε αυτο|αυτο το|εκεινο|οπως ειπαμε|ποιο σημειο/.test(fold(text))) {
    for (const message of [...context.history].reverse()) {
      const previous = detectIntent(message.text);
      if (previous !== 'unknown') return previous;
    }
  }
  return 'unknown';
}

function subjectFor(context: SuggestionContext) {
  const text = fold(incoming(context)?.text ?? '');
  if (/καφε/.test(text)) return 'καφέ';
  if (/σινεμα/.test(text)) return 'σινεμά';
  if (/βολτα/.test(text)) return 'βόλτα';
  return undefined;
}

function relevantSources(context: SuggestionContext, intent: Intent): SourceSample[] {
  // Evidence cannot leak from a different person or channel even if a caller supplies it.
  const allowed = context.sources.filter(source => source.contactId === context.contact.id && source.channel === context.channel);
  return allowed.filter(source => source.intent === intent).slice(0, 2);
}

function replyText(context: SuggestionContext, intent: Intent, samples: SourceSample[]) {
  const topic = subjectFor(context);
  const relationship = context.contact.relationship;
  if (intent === 'invitation' && topic) {
    if (relationship === 'friend') return `ωραία ιδέα για ${topic}! πες μου λίγες λεπτομέρειες 🙂`;
    if (relationship === 'classmate') return `Ευχαριστώ για την πρόσκληση για ${topic}! Πες μου λίγες λεπτομέρειες.`;
    return `Καλησπέρα σας, σας ευχαριστώ για την πρόσκληση για ${topic}. Θα μπορούσατε να μου στείλετε περισσότερες λεπτομέρειες;`;
  }
  if (samples[0]) return samples[0].ownerText;
  // No source is invented if a future repository has an incomplete profile.
  return relationship === 'professor'
    ? 'Καλησπέρα σας, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να μου δώσετε περισσότερες λεπτομέρειες;'
    : relationship === 'friend' ? 'πες μου λίγες λεπτομέρειες 🙂' : 'Πες μου λίγες περισσότερες λεπτομέρειες.';
}

function evidence(context: SuggestionContext, intent: Intent, samples: SourceSample[], text: string): Suggestion {
  return {
    text, intent,
    sourceIds: samples.map(source => source.id),
    traits: [...new Set(samples.flatMap(source => source.traits))].length
      ? [...new Set(samples.flatMap(source => source.traits))]
      : [...context.contact.style],
  };
}

function prefixSuffix(candidate: string, draft: string): string | null {
  // Preserve everything the judge typed; a completion only appends new text.
  const target = fold(draft);
  if (!target) return null;
  for (let boundary = 1; boundary <= candidate.length; boundary += 1) {
    const prefix = candidate.slice(0, boundary);
    if (fold(prefix) === target && !/\s$/.test(prefix)) {
      const tail = candidate.slice(boundary);
      const leadingWhitespace = draft.match(/\s+$/)?.[0] ?? '';
      return leadingWhitespace ? tail.replace(/^\s+/, '') : tail;
    }
  }
  return null;
}

/** Deterministic demo implementation. Replace with a server adapter using the same interface. */
export class MockSuggestionProvider implements SuggestionProvider {
  async suggestReply(context: SuggestionContext): Promise<Suggestion | null> {
    if (!incoming(context)?.text.trim()) return null;
    const intent = intentFor(context);
    const samples = relevantSources(context, intent);
    return evidence(context, intent, samples, replyText(context, intent, samples));
  }

  async autocomplete(context: SuggestionContext): Promise<Suggestion | null> {
    if (!context.draft.trim() || !incoming(context)?.text.trim()) return null;
    const intent = intentFor(context);
    // Unknown topics have no sufficiently grounded continuation.
    if (intent === 'unknown') return null;
    const samples = relevantSources(context, intent);
    const fullReply = replyText(context, intent, samples);
    const relationship = context.contact.relationship;
    const yesReply = relationship === 'professor'
      ? 'Ναι, σας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να μου δώσετε περισσότερες λεπτομέρειες;'
      : relationship === 'friend'
        ? intent === 'assignment' ? 'Ναι, για την εργασία λες; πες μου ποιο σημείο εννοείς 🙂' : 'Ναι, το είδα! πες μου λίγες λεπτομέρειες 🙂'
        : intent === 'assignment' ? 'Ναι, για την εργασία, ποιο σημείο εννοείς;' : 'Ναι, το είδα, ευχαριστώ! Πες μου λίγες λεπτομέρειες.';
    for (const candidate of [fullReply, yesReply]) {
      const suffix = prefixSuffix(candidate, context.draft);
      if (suffix?.trim()) return evidence(context, intent, samples, suffix);
    }
    return null;
  }
}

export const suggestionProvider: SuggestionProvider = new MockSuggestionProvider();
