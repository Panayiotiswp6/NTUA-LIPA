import type { AvailabilityResult, ScheduleEvent, ScheduleOccurrence, ScheduleOverlap, Weekday } from './scheduleTypes';

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el');
const dayMs = 86_400_000;
const weekdays = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const weekdayRoots: Array<[RegExp, Weekday]> = [[/κυριακ[ηα]/, 0], [/δευτερ[αη]/, 1], [/τριτ[ηα]/, 2], [/τεταρτ[ηα]/, 3], [/πεμπτ[ηα]/, 4], [/παρασκευ[ηα]/, 5], [/σαββατο/, 6]];

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * dayMs).toISOString().slice(0, 10);
}
export function getWeekDates(date: string): string[] {
  if (!isValidDate(date)) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}
export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return NaN;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour >= 0 && hour <= 24 && minute >= 0 && minute < 60 && (hour !== 24 || minute === 0) ? hour * 60 + minute : NaN;
}
export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function matchesDate(event: ScheduleEvent, date: string): boolean {
  if (event.date) return event.date === date;
  return event.weekday === new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Expand weekly/date-specific entries onto one local day, including the previous night's tail. */
export function getEventsForDate(date: string, events: ScheduleEvent[]): ScheduleOccurrence[] {
  if (!isValidDate(date)) return [];
  const previous = addDays(date, -1);
  return events.flatMap(event => {
    if (!event.enabled) return [];
    const start = timeToMinutes(event.start), end = timeToMinutes(event.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= 1440 || start === end) return [];
    const overnight = end < start;
    const result: ScheduleOccurrence[] = [];
    if (matchesDate(event, date)) result.push({ ...event, date, originDate: date, originalStart: event.start, originalEnd: event.end,
      start: event.start, end: overnight ? '24:00' : event.end, startMinutes: start, endMinutes: overnight ? 1440 : end,
      isCarryOver: false, continuesNextDay: overnight });
    if (overnight && end > 0 && matchesDate(event, previous)) result.push({ ...event, date, originDate: previous,
      originalStart: event.start, originalEnd: event.end, start: '00:00', end: event.end, startMinutes: 0, endMinutes: end,
      isCarryOver: true, continuesNextDay: false });
    return result;
  }).sort((first, second) => first.startMinutes - second.startMinutes || first.title.localeCompare(second.title, 'el'));
}
export function findScheduleOverlaps(date: string, events: ScheduleEvent[]): ScheduleOverlap[] {
  const occurrences = getEventsForDate(date, events);
  const overlaps: ScheduleOverlap[] = [];
  for (let first = 0; first < occurrences.length; first++) for (let second = first + 1; second < occurrences.length; second++) {
    const startMinutes = Math.max(occurrences[first].startMinutes, occurrences[second].startMinutes);
    const endMinutes = Math.min(occurrences[first].endMinutes, occurrences[second].endMinutes);
    if (startMinutes < endMinutes) overlaps.push({ first: occurrences[first], second: occurrences[second], startMinutes, endMinutes });
  }
  return overlaps;
}

function parseDate(text: string, reference: string): { date?: string; remaining: string; question?: string; hasDate: boolean } {
  let remaining = text;
  const iso = /(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(remaining);
  const fullDot = iso ? null : /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/.exec(remaining);
  // Bare 8-10 is a clock range. Short dates use '/', while hyphenated dates require a year.
  const common = iso || fullDot ? null : /(?<![\d:.])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d:.])/.exec(remaining)
    || /(?<![\d:.])(\d{1,2})-(\d{1,2})-(\d{4}|\d{2})(?![\d:.])/.exec(remaining);
  const explicit = iso || fullDot || common;
  if (explicit) {
    const year = iso ? Number(iso[1]) : fullDot ? Number(fullDot[3]) : common?.[3] ? Number(common[3].length === 2 ? `20${common[3]}` : common[3]) : Number(reference.slice(0, 4));
    const month = Number(iso ? iso[2] : explicit[2]);
    const day = Number(iso ? iso[3] : explicit[1]);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    remaining = remaining.replace(explicit[0], ' ');
    if (!isValidDate(date)) return { remaining, hasDate: true, question: 'Ποια ακριβώς ημερομηνία εννοείς;' };
    const namedDay = weekdayRoots.find(([pattern]) => pattern.test(text));
    if (namedDay && namedDay[1] !== new Date(`${date}T12:00:00Z`).getUTCDay()) return { remaining, hasDate: true, question: 'Η ημέρα και η ημερομηνία δεν συμφωνούν. Ποια εννοείς;' };
    return { date, remaining, hasDate: true };
  }
  if (/μεθαυριο/.test(text)) return { date: addDays(reference, 2), remaining, hasDate: true };
  if (/αυριο/.test(text)) return { date: addDays(reference, 1), remaining, hasDate: true };
  if (/σημερα|αποψε/.test(text)) return { date: reference, remaining, hasDate: true };
  if (/σαββατοκυριακο/.test(text)) return { remaining, hasDate: true, question: 'Το Σάββατο ή την Κυριακή, και τι ώρα;' };
  const mentions = weekdayRoots.filter(([pattern]) => pattern.test(text));
  if (mentions.length > 1) return { remaining, hasDate: true, question: 'Ποια από τις ημέρες εννοείς;' };
  if (mentions.length === 1) {
    const target = mentions[0][1];
    const current = new Date(`${reference}T12:00:00Z`).getUTCDay();
    let days = (target - current + 7) % 7;
    if (/επομεν\S*\s+εβδομαδ/.test(text)) {
      const monday = getWeekDates(reference)[0];
      return { date: addDays(monday, 7 + ((target + 6) % 7)), remaining, hasDate: true };
    }
    if (/επομεν/.test(text) && days === 0) days = 7;
    return { date: addDays(reference, days), remaining, hasDate: true };
  }
  if (/σαββατοκυριακο/.test(text)) return { remaining, hasDate: true, question: 'Το Σάββατο ή την Κυριακή, και τι ώρα;' };
  return { remaining, hasDate: false };
}

interface ParsedTime { start?: number; end?: number; duration?: number; explicitDuration?: boolean; question?: string; hasTime: boolean }
function parseTime(text: string): ParsedTime {
  let remaining = text;
  let duration: number | undefined;
  const durationMatch = /(?:για|διαρκεια(?:σ)?)\s+(\d+(?:[.,]\d+)?)\s*(ωρ(?:α|εσ|ες)?|λεπτ(?:ο|α)?)/.exec(remaining);
  if (durationMatch) {
    const amount = Number(durationMatch[1].replace(',', '.'));
    duration = Math.round(amount * (durationMatch[2].startsWith('ωρ') ? 60 : 1));
    remaining = remaining.replace(durationMatch[0], ' ');
  } else if (/για\s+μιση\s+ωρα/.test(remaining)) { duration = 30; remaining = remaining.replace(/για\s+μιση\s+ωρα/, ' '); }
  else if (/για\s+(?:μια|μιαν|ενα)\s+ωρα/.test(remaining)) { duration = 60; remaining = remaining.replace(/για\s+(?:μια|μιαν|ενα)\s+ωρα/, ' '); }
  const evening = /απογευμ|βραδ|μεσημερ|(?<![a-zα-ω])μ\.?\s*μ\.?(?![a-zα-ω])|\bpm\b/.test(remaining);
  const morning = /πρωι|(?<![a-zα-ω])π\.?\s*μ\.?(?![a-zα-ω])|\bam\b/.test(remaining);
  const period = evening ? 'pm' : morning ? 'am' : undefined;
  const convert = (hour: number) => period === 'pm' && hour < 12 ? hour + 12 : period === 'am' && hour === 12 ? 0 : hour;
  const range = /(?<!\d)(\d{1,2})(?:[:.]([0-5]\d))?\s*(?:-|–|—|εωσ|εως|μεχρι|με)\s*(\d{1,2})(?:[:.]([0-5]\d))?(?!\d)/.exec(remaining);
  if (range) {
    const firstHour = Number(range[1]), lastHour = Number(range[3]);
    if (firstHour > 23 || lastHour > 23) return { hasTime: true, question: 'Μπορείς να γράψεις την ώρα σε μορφή 24ώρου, π.χ. 20:00–22:00;' };
    if (!period && !range[2] && !range[1].startsWith('0') && firstHour >= 1 && firstHour <= 8) return { hasTime: true, question: 'Εννοείς πρωί ή απόγευμα/βράδυ; Γράψε την ώρα σε 24ωρη μορφή.' };
    const start = convert(firstHour) * 60 + Number(range[2] || 0);
    const endHour = start >= 18 * 60 && lastHour <= 6 && (range[4] || range[3].startsWith('0')) ? lastHour : convert(lastHour);
    let end = endHour * 60 + Number(range[4] || 0);
    if (end <= start) end += 1440;
    return { start, end, duration: end - start, explicitDuration: true, hasTime: true };
  }
  if (/(?:\d{1,2}(?:[:.]\d{2})?)\s+η\s+(?:στισ\s+|στις\s+)?\d/.test(remaining)) return { hasTime: true, question: 'Ποια από τις ώρες προτιμάς;' };
  const clock = /(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/.exec(remaining);
  const bare = clock ? null : /(?:στισ|στις|στην|στη|ωρα)\s*(\d{1,2})(?![\d:.])/.exec(remaining)
    || /(?<!\d)(\d{1,2})(?![\d:.])/.exec(remaining);
  if (!clock && !bare) {
    if (/μεσανυχτα/.test(remaining)) return { start: 0, duration, explicitDuration: duration !== undefined, hasTime: true };
    return { duration, hasTime: false };
  }
  const hourText = clock?.[1] || bare![1];
  const hour = Number(hourText);
  if (hour > 23) return { hasTime: true, question: 'Ποια ώρα εννοείς σε 24ωρη μορφή;' };
  if (!clock && !period && !hourText.startsWith('0') && hour >= 1 && hour <= 8) return { hasTime: true, question: 'Εννοείς πρωί ή απόγευμα/βράδυ; Γράψε την ώρα σε 24ωρη μορφή.' };
  return { start: convert(hour) * 60 + Number(clock?.[2] || 0), duration, explicitDuration: duration !== undefined, hasTime: true };
}

/** A deterministic local-calendar check. Availability never books or accepts an invitation. */
export function resolveAvailability(message: string, referenceDate: string, events: ScheduleEvent[], defaultDuration = 60): AvailabilityResult {
  const empty = { conflicts: [] as ScheduleOccurrence[], sourceIds: [] as string[] };
  const text = fold(message);
  const schedulingIntent = /καφε|παμε|βρεθ|συναντ|ραντεβου|σινεμα|βγουμε|μπουζουκ|εξοδο|διαθεσ|διαθετ|κανονισ|ελα\s|ερθεισ|ερθεις|προσκλη/.test(text);
  const temporalMarker = /δευτερ|τριτη|τεταρτ|πεμπτ|παρασκευ|σαββατ|κυριακ|σημερα|αυριο|αποψε|\d{1,2}[:.]\d{2}|στισ?\s*\d|στις\s*\d|ωρα\s*\d|\d{1,2}\/\d{1,2}/.test(text);
  const availabilityRequest = /μπορ|βολευ|ελευθερ|διαθεσ|διαθετ|ερχεσ|ερθετ/.test(text);
  const temporalOnly = !text
    .replace(/δευτερα|τριτη|τεταρτη|πεμπτη|παρασκευη|σαββατο|κυριακη|μεθαυριο|σημερα|αυριο|αποψε|απογευμα|πρωι|βραδυ|μεσημερι|στισ|στις|ωρα|την|τη|το|απο|εως|μεχρι/g, '')
    .replace(/[\d\s:./,;?!\-–—]/g, '').length;
  if (!schedulingIntent && !(temporalMarker && (availabilityRequest || temporalOnly))) return { ...empty, status: 'not_scheduling', reason: 'Το μήνυμα δεν ζητά έλεγχο διαθεσιμότητας.' };
  if (!isValidDate(referenceDate)) return { ...empty, status: 'clarify', reason: 'Δεν έχει οριστεί έγκυρη ημερομηνία αναφοράς.', question: 'Ποια είναι η ημερομηνία αναφοράς;' };
  const parsedDate = parseDate(text, referenceDate);
  const parsedTime = parseTime(parsedDate.remaining);
  if (parsedDate.question) return { ...empty, status: 'clarify', reason: parsedDate.question, question: parsedDate.question };
  if (!parsedDate.date) return { ...empty, status: 'clarify', reason: 'Λείπει η ημέρα της συνάντησης.', question: 'Ποια ημέρα εννοείς;' };
  if (parsedTime.question) return { ...empty, status: 'clarify', date: parsedDate.date, reason: parsedTime.question, question: parsedTime.question };
  if (parsedTime.start === undefined) return { ...empty, status: 'clarify', date: parsedDate.date, reason: 'Λείπει συγκεκριμένη ώρα για έλεγχο του προγράμματος.', question: 'Τι ώρα σε βολεύει;' };
  const duration = parsedTime.duration ?? defaultDuration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return { ...empty, status: 'clarify', date: parsedDate.date, reason: 'Χρειάζεται σαφής διάρκεια έως μία ημέρα.', question: 'Πόση ώρα υπολογίζεις ότι θα κρατήσει;' };
  const requestedEnd = parsedTime.end ?? parsedTime.start + duration;
  const endDate = addDays(parsedDate.date, Math.floor(requestedEnd / 1440));
  const segments = [{ date: parsedDate.date, start: parsedTime.start, end: Math.min(requestedEnd, 1440) }];
  if (requestedEnd > 1440) segments.push({ date: addDays(parsedDate.date, 1), start: 0, end: requestedEnd - 1440 });
  const conflicts = segments.flatMap(segment => getEventsForDate(segment.date, events).filter(event => event.startMinutes < segment.end && event.endMinutes > segment.start));
  const unique = conflicts.filter((event, index) => conflicts.findIndex(other => other.id === event.id && other.originDate === event.originDate) === index);
  unique.sort((first, second) => Number(first.status === 'tentative') - Number(second.status === 'tentative') || first.startMinutes - second.startMinutes);
  const confirmed = unique.filter(event => event.status === 'confirmed');
  const status = confirmed.length ? 'conflict' : unique.length ? 'tentative' : 'available';
  const durationAssumed = !parsedTime.explicitDuration;
  const durationNote = durationAssumed ? ` Έλεγχος για ${duration} λεπτά (ενδεικτική διάρκεια, μπορεί να αλλάξει).` : '';
  const descriptions = unique.map(event => `${event.title} (${event.start}–${event.end})${event.status === 'tentative' ? ' · πιθανή εργαστηριακή/προαιρετική δέσμευση' : ''}`).join(' · ');
  const reason = status === 'conflict' ? `Υπάρχει καταχωρισμένη δέσμευση: ${descriptions}.${durationNote}`
    : status === 'tentative' ? `Υπάρχει πιθανή δέσμευση που χρειάζεται επιβεβαίωση ομάδας/επιλογής: ${descriptions}.${durationNote}`
    : `Δεν υπάρχει καταχωρισμένη δέσμευση την ${weekdays[new Date(`${parsedDate.date}T12:00:00Z`).getUTCDay()]} ${minutesToTime(parsedTime.start)}–${minutesToTime(requestedEnd % 1440)}. Δεν έχει υπολογιστεί χρόνος μετακίνησης.${durationNote}`;
  return { status, date: parsedDate.date, start: minutesToTime(parsedTime.start), end: minutesToTime(requestedEnd % 1440), endDate,
    durationMinutes: duration, durationAssumed, reason, conflicts: unique, sourceIds: [...new Set(unique.map(event => event.id))] };
}
