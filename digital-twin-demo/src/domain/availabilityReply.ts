import type { SuggestionContext } from './types';
import type { AvailabilityResult } from './scheduleTypes';

const weekdayPhrases = ['την Κυριακή', 'τη Δευτέρα', 'την Τρίτη', 'την Τετάρτη', 'την Πέμπτη', 'την Παρασκευή', 'το Σάββατο'];
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el');
const topic = (context: SuggestionContext) => {
  const incoming = fold(context.lastIncoming?.text || '');
  return /καφε/.test(incoming) ? 'για καφέ' : /σινεμα/.test(incoming) ? 'για σινεμά' : /βολτα/.test(incoming) ? 'για βόλτα' : 'για συνάντηση';
};

export function availabilityReply(context: SuggestionContext, result: AvailabilityResult): string {
  const formal = context.contact.relationship === 'professor';
  const casual = context.contact.relationship === 'friend';
  const when = result.date && result.start
    ? `${weekdayPhrases[new Date(`${result.date}T12:00:00Z`).getUTCDay()]} στις ${result.start}`
    : 'εκείνη την ώρα';
  const activity = topic(context);
  const confirmed = result.conflicts.filter(event => event.status === 'confirmed');
  const events = (confirmed.length ? confirmed : result.conflicts).slice(0, 2);
  const commitments = events.map(event => `${event.title} (${event.originalStart}–${event.originalEnd})`).join(' και ');
  if (result.status === 'conflict') {
    if (formal) return `Καλησπέρα σας, ${when} δεν είμαι διαθέσιμος, καθώς έχω ${commitments}. Θα μπορούσαμε να εξετάσουμε άλλη ώρα;`;
    if (casual) return `όχι ρε, ${when} δεν μπορώ ${activity}· έχω ${commitments}. να το δούμε άλλη ώρα;`;
    return `${when} δεν μπορώ ${activity}, έχω ${commitments}. Να βρούμε άλλη ώρα;`;
  }
  if (result.status === 'tentative') {
    if (formal) return `Καλησπέρα σας, ${when} υπάρχει πιθανή δέσμευση στο πρόγραμμά μου: ${commitments}. Χρειάζεται να επιβεβαιώσω το πρόγραμμά μου πριν σας απαντήσω οριστικά.`;
    return `${when} έχω πιθανή δέσμευση: ${commitments}. Να επιβεβαιώσω πρώτα το πρόγραμμά μου πριν κανονίσουμε ${activity};`;
  }
  if (result.status === 'available') {
    if (formal) return `Καλησπέρα σας, ${when} δεν υπάρχει καταχωρισμένη υποχρέωση στο ημερολόγιό μου και φαίνομαι διαθέσιμος. Θα μπορούσατε να μου δώσετε τις λεπτομέρειες;`;
    return casual
      ? `${when} φαίνομαι ελεύθερος στο πρόγραμμά μου ${activity} 🙂 πες μου πού το σκέφτεσαι!`
      : `${when} δεν έχω καταχωρισμένη υποχρέωση στο πρόγραμμά μου ${activity}. Πες μου τις λεπτομέρειες.`;
  }
  if (result.status === 'clarify') {
    const question = result.question || 'Ποια ημέρα και ώρα εννοείς;';
    return formal ? `Καλησπέρα σας. Θα μπορούσατε να διευκρινίσετε: ${question}` : question;
  }
  return '';
}

/** Candidate openings must preserve the writer's prefix and the calendar decision. */
export function availabilityCandidates(context: SuggestionContext, result: AvailabilityResult): string[] {
  const full = availabilityReply(context, result);
  const formal = context.contact.relationship === 'professor';
  const detail = formal ? full.replace(/^Καλησπέρα σας[,\.]?\s*/, '') : full.replace(/^όχι ρε,\s*/, '');
  if (formal) return [full, `Ναι, σας ευχαριστώ για το μήνυμά σας. ${detail}`, `Σας ευχαριστώ. ${detail}`, `Καλημέρα σας, ${detail}`];
  const neutral = result.status === 'conflict' ? `το είδα, αλλά ${detail}` : detail;
  return [full, `Ναι, ${neutral}`, `Οκ, ${neutral}`, `Ευχαριστώ! ${detail}`, `Τέλεια που μου έστειλες, ${detail}`];
}
