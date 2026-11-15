import { describe, expect, it } from 'vitest';
import { resolveAvailability } from './schedule';
import { DEFAULT_REFERENCE_DATE, initialScheduleEvents } from './scheduleData';
import type { ScheduleEvent } from './scheduleTypes';

const events = () => structuredClone(initialScheduleEvents);
const resolve = (message: string, referenceDate = DEFAULT_REFERENCE_DATE, duration = 60, schedule = events()) =>
  resolveAvailability(message, referenceDate, schedule, duration);

describe('deterministic calendar availability', () => {
  it('declines Monday coffee at 10 because Signals and Systems occupies 08:45–10:30', () => {
    const result = resolve('Πάμε για καφέ τη Δευτέρα στις 10;');
    expect(result.status).toBe('conflict');
    expect(result.date).toBe('2026-11-16');
    expect(result.start).toBe('10:00');
    expect(result.sourceIds).toContain('school-signals-mon');
    expect(result.conflicts.find(item => item.id === 'school-signals-mon')).toMatchObject({
      title: 'Σήματα και Συστήματα', originalStart: '08:45', originalEnd: '10:30',
    });
  });

  it('uses half-open intervals and excludes disabled electives at the exact lesson end', () => {
    const result = resolve('Καφές τη Δευτέρα στις 10:30;', DEFAULT_REFERENCE_DATE, 15);
    expect(result.status).toBe('available');
    expect(result.sourceIds).not.toContain('school-signals-mon');
    expect(result.conflicts).toHaveLength(0);
    expect(events().filter(item => item.optional).every(item => !item.enabled)).toBe(true);
  });

  it('keeps group laboratory slots tentative rather than asserting certain attendance', () => {
    const result = resolve('Να βρεθούμε την Τρίτη στις 11:00;');
    expect(result.status).toBe('tentative');
    expect(result.sourceIds).toContain('school-electronics-lab-tue');
    expect(result.conflicts.every(item => item.status === 'tentative')).toBe(true);
  });

  it('prioritizes a confirmed guitar conflict while retaining the overlapping tentative lab evidence', () => {
    const result = resolve('Πάμε για καφέ την Τρίτη στις 4 το απόγευμα;');
    expect(result.status).toBe('conflict');
    expect(result.start).toBe('16:00');
    expect(result.sourceIds).toContain('guitar-2');
    expect(result.sourceIds).toContain('school-electronics-lab-tue');
  });

  it('applies evening gym on weekdays except Wednesday and the Saturday afternoon session', () => {
    const monday = resolve('Πάμε για καφέ τη Δευτέρα στις 9 το βράδυ;');
    expect(monday.status).toBe('conflict');
    expect(monday.sourceIds).toContain('gym-1');
    const wednesday = resolve('Πάμε για καφέ την Τετάρτη στις 21:00;');
    expect(wednesday.status).toBe('available');
    const saturday = resolve('Να βρεθούμε το Σάββατο στις 15:00;');
    expect(saturday.status).toBe('conflict');
    expect(saturday.sourceIds).toContain('gym-saturday');
  });

  it('uses the school lecture shown on Friday afternoon', () => {
    const result = resolve('Πάμε για καφέ την Παρασκευή στις 13:00;');
    expect(result.status).toBe('conflict');
    expect(result.sourceIds).toContain('school-electronics-fri');
  });

  it('resolves relative days from the configured Athens reference date', () => {
    expect(resolve('Πάμε για καφέ σήμερα στις 10:00;').date).toBe('2026-11-16');
    const tomorrow = resolve('Πάμε για καφέ αύριο στις 09:00;');
    expect(tomorrow.date).toBe('2026-11-17');
    expect(tomorrow.sourceIds).toContain('school-probability-tue');
    const afterTomorrow = resolve('Πάμε για καφέ μεθαύριο στις 09:00;');
    expect(afterTomorrow.date).toBe('2026-11-18');
    expect(afterTomorrow.sourceIds).toContain('school-signals-wed');
  });

  it('recognizes a specific date without treating its digits as a time', () => {
    const result = resolve('Μπορούμε να συναντηθούμε στις 18/11/2026 στις 10:45;');
    expect(result.date).toBe('2026-11-18');
    expect(result.start).toBe('10:45');
    expect(result.status).toBe('conflict');
    expect(result.sourceIds).toContain('school-cs-wed');
  });

  it('asks for missing or ambiguous hours and leaves unrelated messages to the style provider', () => {
    const missing = resolve('Πάμε για καφέ τη Δευτέρα;');
    expect(missing.status).toBe('clarify');
    expect(missing.question).toBeTruthy();
    const ambiguous = resolve('Πάμε για καφέ τη Δευτέρα στις 8;');
    expect(ambiguous.status).toBe('clarify');
    expect(ambiguous.sourceIds).toHaveLength(0);
    expect(resolve('Σου έστειλα τις σημειώσεις της εργασίας.').status).toBe('not_scheduling');
  });

  it('carries a dated Sunday night arrangement over into Monday without recurring forever', () => {
    const sunday = resolve('Πάμε για καφέ την Κυριακή στις 23:00;');
    expect(sunday.status).toBe('conflict');
    expect(sunday.sourceIds).toContain('extra-bouzoukia-sunday');
    const monday = resolve('Να βρεθούμε σήμερα στις 01:00;', '2026-11-23');
    expect(monday.status).toBe('conflict');
    expect(monday.sourceIds).toContain('extra-bouzoukia-sunday');
    expect(monday.conflicts.find(item => item.id === 'extra-bouzoukia-sunday')?.isCarryOver).toBe(true);
    expect(resolve('Να βρεθούμε σήμερα στις 23:00;', '2026-11-29').status).toBe('available');
  });

  it('honors edited/disabled calendar events immediately without mutating the saved fixtures', () => {
    const edited = events();
    const signals = edited.find(item => item.id === 'school-signals-mon')!;
    signals.enabled = false;
    expect(resolve('Πάμε για καφέ τη Δευτέρα στις 10;', DEFAULT_REFERENCE_DATE, 30, edited).status).toBe('available');
    expect(resolve('Πάμε για καφέ τη Δευτέρα στις 10;', DEFAULT_REFERENCE_DATE, 60, edited).status).toBe('tentative');
    expect(initialScheduleEvents.find(item => item.id === signals.id)?.enabled).toBe(true);
    const extra: ScheduleEvent = { id: 'extra-dentist', title: 'Οδοντίατρος', date: '2026-11-16', start: '10:00', end: '11:00', category: 'personal', enabled: true, status: 'confirmed', source: 'Calendar edit' };
    edited.push(extra);
    expect(resolve('Πάμε για καφέ τη Δευτέρα στις 10;', DEFAULT_REFERENCE_DATE, 60, edited).sourceIds).toContain(extra.id);
  });

  it('checks the whole requested interval rather than only the starting instant', () => {
    const result = resolve('Πάμε για καφέ το Σάββατο στις 13:00;', DEFAULT_REFERENCE_DATE, 120);
    expect(result.status).toBe('conflict');
    expect(result.sourceIds).toContain('gym-saturday');
    expect(result.durationMinutes).toBe(120);
  });

  it('uses an explicit start/end range instead of the assumed default duration', () => {
    const result = resolve('Πάμε για καφέ το Σάββατο 13:30-14:30;');
    expect(result.status).toBe('conflict');
    expect(result.start).toBe('13:30');
    expect(result.end).toBe('14:30');
    expect(result.durationMinutes).toBe(60);
    expect(result.durationAssumed).toBe(false);
    expect(result.sourceIds).toContain('gym-saturday');
  });

  it('distinguishes bare hyphen clock ranges from dates', () => {
    const evening = resolve('Πάμε για καφέ τη Δευτέρα 20-22;');
    expect(evening.date).toBe('2026-11-16');
    expect(evening.start).toBe('20:00');
    expect(evening.end).toBe('22:00');
    expect(evening.sourceIds).toContain('gym-1');
    const ambiguous = resolve('Καφές τη Δευτέρα 8-10;');
    expect(ambiguous.status).toBe('clarify');
    expect(ambiguous.date).toBe('2026-11-16');
    const dated = resolve('Πάμε για καφέ στις 18-11-2026 στις 10:45;');
    expect(dated.date).toBe('2026-11-18');
    expect(dated.sourceIds).toContain('school-cs-wed');
  });

  it('does not turn dated informational statements into meeting requests', () => {
    expect(resolve('Ανέβασα την εργασία τη Δευτέρα.').status).toBe('not_scheduling');
    expect(resolve('Η εκφώνηση αναρτήθηκε την Τρίτη στις 10:00.').status).toBe('not_scheduling');
    expect(resolve('Δευτέρα στις 10;').status).toBe('conflict');
  });

  it('does not read the letters μμ inside πρόγραμμα as an evening qualifier', () => {
    const result = resolve('Στο πρόγραμμα, μπορείς για καφέ τη Δευτέρα στις 10;');
    expect(result.start).toBe('10:00');
    expect(result.sourceIds).toContain('school-signals-mon');
  });

  it('asks for clarification when explicit weekday and date disagree', () => {
    expect(resolve('Πάμε για καφέ τη Δευτέρα 18/11/2026 στις 10:00;').status).toBe('clarify');
  });
});
