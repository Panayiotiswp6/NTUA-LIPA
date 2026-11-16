import type { AvailabilityResult } from '../src/domain/scheduleTypes';
import type { Relationship } from '../src/domain/types';

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

/** Every clock time mentioned in a text, normalised to HH:MM ("10.00", "10:00", "στις 10"). */
export function extractTimes(text: string): Set<string> {
  const times = new Set<string>();
  const folded = fold(text);
  for (const match of folded.matchAll(/(?<![\d/.:-])([01]?\d|2[0-4])[:.]([0-5]\d)(?![\d/.:-]*\d)/g)) {
    times.add(`${match[1].padStart(2, '0')}:${match[2]}`);
  }
  for (const match of folded.matchAll(/(?<!\p{L})(?:στις|τις)\s+(\d{1,2})(?![\d:./])/gu)) {
    const hour = Number(match[1]);
    if (hour <= 24) times.add(`${String(hour).padStart(2, '0')}:00`);
  }
  return times;
}

/** Times the reply may mention: what the contact wrote, what the owner typed, and the calendar evidence. */
export function allowedTimes(incoming: string, draft: string, availability?: AvailabilityResult): Set<string> {
  const allowed = new Set([...extractTimes(incoming), ...extractTimes(draft)]);
  if (availability) {
    for (const time of [availability.start, availability.end]) if (time) allowed.add(time);
    for (const event of availability.conflicts) {
      for (const time of [event.originalStart, event.originalEnd, event.start, event.end]) allowed.add(time);
    }
  }
  return allowed;
}

const EMOJI = /\p{Extended_Pictographic}/u;
const INFORMAL = /(?<!\p{L})(ρε|φιλε|φιλαρακι|ελα|χαχα|lol)(?!\p{L})/u;
const ACCEPTS = /(μπορω|διαθεσιμ|ελευθερ|κανονιστηκε|τα λεμε τοτε|οκ για)/g;
const NEGATION = /(δεν|δε|οχι|ουτε|δυστυχως)\s*(\S+\s*){0,3}$/;

export interface GuardInput {
  text: string;
  incoming: string;
  draft: string;
  relationship: Relationship;
  availability?: AvailabilityResult;
  maxLength: number;
}
export interface GuardResult {
  passed: boolean;
  checks: string[];
  issues: string[];
}

/**
 * Deterministic checks on model output. The model phrases the reply; these rules decide whether it may be shown.
 * They encode the agreed requirements: no invented times, no contradiction of the calendar, register that fits the person.
 */
export function guardReply(input: GuardInput): GuardResult {
  const issues: string[] = [];
  const checks: string[] = [];
  const text = input.text.trim();
  const folded = fold(text);

  checks.push('μη κενή απάντηση');
  if (!text) issues.push('Η απάντηση είναι κενή.');

  checks.push(`μήκος ≤ ${input.maxLength} χαρακτήρες`);
  if (text.length > input.maxLength) issues.push(`Η απάντηση ξεπερνά τους ${input.maxLength} χαρακτήρες.`);

  checks.push('καμία ώρα εκτός μηνύματος/ημερολογίου');
  const allowed = allowedTimes(input.incoming, input.draft, input.availability);
  const invented = [...extractTimes(text)].filter(time => !allowed.has(time));
  if (invented.length) issues.push(`Αναφέρει ώρα που δεν υπάρχει στο μήνυμα ή στο ημερολόγιο: ${invented.join(', ')}.`);

  if (input.availability?.status === 'conflict' || input.availability?.status === 'tentative') {
    checks.push('δεν αντιφάσκει με το ημερολόγιο');
    for (const match of folded.matchAll(ACCEPTS)) {
      const before = folded.slice(Math.max(0, match.index! - 30), match.index);
      if (!NEGATION.test(before)) {
        issues.push(`Φαίνεται να δέχεται ώρα που το ημερολόγιο δείχνει ${input.availability.status === 'conflict' ? 'κατειλημμένη' : 'πιθανώς κατειλημμένη'}.`);
        break;
      }
    }
  }

  if (input.relationship === 'professor') {
    checks.push('επίσημο ύφος χωρίς emoji');
    if (EMOJI.test(text)) issues.push('Περιέχει emoji σε επίσημο μήνυμα.');
    if (INFORMAL.test(folded)) issues.push('Περιέχει ανεπίσημη έκφραση σε επίσημο μήνυμα.');
  }

  return { passed: issues.length === 0, checks, issues };
}
