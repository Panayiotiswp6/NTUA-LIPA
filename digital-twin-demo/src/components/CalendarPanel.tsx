import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Info, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { getEventsForDate } from '../domain/schedule';
import type { ScheduleCategory, ScheduleEvent, ScheduleOccurrence } from '../domain/scheduleTypes';
import '../calendar.css';

export interface CalendarPanelProps {
  events: ScheduleEvent[];
  referenceDate: string;
  initialViewedDate?: string;
  onDateChange: (date: string) => void;
  onEventsChange: (events: ScheduleEvent[]) => void;
}

const categoryLabels: Record<ScheduleCategory, string> = { school: 'Σχολή', gym: 'Γυμναστήριο', guitar: 'Κιθάρα', personal: 'Κανονίσματα' };
const dayNames = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const shortDays = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
const START = 7 * 60;
const END = 24 * 60;
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);
const shiftDate = (date: string, amount: number) => { const next = asDate(date); next.setUTCDate(next.getUTCDate() + amount); return next.toISOString().slice(0, 10); };
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const dateLabel = (date: string) => new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Athens' }).format(asDate(date));

function mergedIntervals(occurrences: ScheduleOccurrence[]) {
  const intervals = occurrences.map(event => [Math.max(START, event.startMinutes), Math.min(END, event.endMinutes)]).filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const current of intervals) {
    const last = merged.at(-1);
    if (last && current[0] <= last[1]) last[1] = Math.max(last[1], current[1]);
    else merged.push([...current]);
  }
  return merged;
}

function eventPosition(event: ScheduleOccurrence, events: ScheduleOccurrence[]) {
  // Connected overlap groups use equal columns; events never obscure each other.
  let start = event.startMinutes, end = event.endMinutes;
  let previous = '';
  let group: ScheduleOccurrence[] = [];
  while (previous !== `${start}-${end}`) {
    previous = `${start}-${end}`;
    group = events.filter(item => item.startMinutes < end && item.endMinutes > start);
    start = Math.min(start, ...group.map(item => item.startMinutes));
    end = Math.max(end, ...group.map(item => item.endMinutes));
  }
  group.sort((a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id));
  const columnEnds: number[] = [];
  let eventColumn = 0;
  for (const item of group) {
    let column = columnEnds.findIndex(value => value <= item.startMinutes);
    if (column < 0) column = columnEnds.length;
    columnEnds[column] = item.endMinutes;
    if (item.id === event.id && item.originDate === event.originDate) eventColumn = column;
  }
  const columns = Math.max(1, columnEnds.length);
  return { top: `${((Math.max(START, event.startMinutes) - START) / (END - START)) * 100}%`, height: `${((Math.min(END, event.endMinutes) - Math.max(START, event.startMinutes)) / (END - START)) * 100}%`, left: `calc(${eventColumn * 100 / columns}% + 3px)`, width: `calc(${100 / columns}% - 6px)` };
}

export function CalendarPanel({ events, referenceDate, initialViewedDate, onDateChange, onEventsChange }: CalendarPanelProps) {
  const [viewedDate, setViewedDate] = useState(initialViewedDate || referenceDate);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [extraTitle, setExtraTitle] = useState('');
  const [extraDate, setExtraDate] = useState(initialViewedDate || referenceDate);
  const [extraStart, setExtraStart] = useState('18:00');
  const [extraEnd, setExtraEnd] = useState('19:00');
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState('');
  const weekdays = useMemo(() => {
    const weekday = asDate(viewedDate).getUTCDay();
    const monday = shiftDate(viewedDate, -((weekday + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
  }, [viewedDate]);
  const allOccurrences = useMemo(() => getEventsForDate(viewedDate, events.map(event => ({ ...event, enabled: true }))).map(event => ({ ...event, enabled: events.find(item => item.id === event.id)?.enabled ?? true })), [viewedDate, events]);
  const active = allOccurrences.filter(event => event.enabled);
  const shown = active.filter(event => event.endMinutes > START && event.startMinutes < END);
  const merged = mergedIntervals(active);
  const free: string[] = [];
  let cursor = START;
  for (const [start, end] of merged) { if (start - cursor >= 30) free.push(`${toTime(cursor)}–${toTime(start)}`); cursor = Math.max(cursor, end); }
  if (END - cursor >= 30) free.push(`${toTime(cursor)}–24:00`);
  const busyMinutes = merged.reduce((sum, [start, end]) => sum + end - start, 0);
  const overlapPairs = active.flatMap((event, index) => active.slice(index + 1).filter(other => event.startMinutes < other.endMinutes && event.endMinutes > other.startMinutes).map(other => [event, other]));
  const recurring = events.filter(event => event.weekday !== undefined).sort((a, b) => ((a.weekday! + 6) % 7) - ((b.weekday! + 6) % 7) || a.start.localeCompare(b.start));
  const patchEvent = (id: string, patch: Partial<ScheduleEvent>) => {
    const electives = ['school-elective-economy', 'school-elective-management'];
    if (electives.includes(id) && patch.enabled === true) {
      onEventsChange(events.map(event => event.id === id ? {...event,...patch,status:'confirmed'} : electives.includes(event.id) || event.id === 'school-elective-required-mon' ? {...event,enabled:false} : event));
      return;
    }
    onEventsChange(events.map(event => event.id === id ? {...event,...patch} : event));
  };
  const removeEvent = (id: string) => { onEventsChange(events.filter(event => event.id !== id)); setStatus('Το έκτακτο κανόνισμα διαγράφηκε.'); };
  const changeDate = (date: string) => { if (!date) return; setViewedDate(date); setExtraDate(date); setExpandedEvent(null); };
  const addExtra = (event: FormEvent) => {
    event.preventDefault();
    if (!extraTitle.trim() || !extraDate || !extraStart || !extraEnd) { setFormError('Συμπλήρωσε τίτλο, ημερομηνία και ώρες.'); return; }
    if (extraStart === extraEnd) { setFormError('Η έναρξη και η λήξη πρέπει να διαφέρουν.'); return; }
    const created: ScheduleEvent = { id: `extra-${crypto.randomUUID()}`, title: extraTitle.trim(), date: extraDate, start: extraStart, end: extraEnd, category: 'personal', enabled: true, status: 'confirmed', source: 'Προσωπικό ημερολόγιο · καταχώριση μέσα στο demo' };
    onEventsChange([...events, created]); setViewedDate(extraDate); setExtraTitle(''); setFormError(''); setStatus('Το νέο κανόνισμα προστέθηκε. Οι προτάσεις ενημερώνονται αυτόματα.');
  };

  return <div className="calendar-panel">
    <div className="calendar-heading"><span><CalendarDays size={23}/></span><div><h3>Η εικόνα της ημέρας σου</h3><p>Σχολή, ρουτίνα και ό,τι έχεις ήδη κανονίσει.</p></div></div>
    <label className="calendar-reference-date"><span>Σήμερα στο demo</span><input type="date" aria-label="Calendar reference date" value={referenceDate} onChange={event => { if (event.target.value) { onDateChange(event.target.value); changeDate(event.target.value); } }}/><small>Αυτή η ημερομηνία ορίζει το «σήμερα» και το «αύριο» στα μηνύματα.</small></label>
    <div className="calendar-datebar"><button aria-label="Previous calendar day" onClick={() => changeDate(shiftDate(viewedDate, -1))}><ChevronLeft size={20}/></button><label><span>Προβολή ημέρας</span><input type="date" aria-label="Calendar viewed date" value={viewedDate} onChange={event => changeDate(event.target.value)}/></label><button aria-label="Next calendar day" onClick={() => changeDate(shiftDate(viewedDate, 1))}><ChevronRight size={20}/></button></div>
    <div className="calendar-weekstrip" aria-label="Calendar week">{weekdays.map(date => <button key={date} className={`${date === viewedDate ? 'active' : ''} ${getEventsForDate(date, events).length ? 'has-events' : ''}`} aria-label={dateLabel(date)} aria-pressed={date === viewedDate} onClick={() => changeDate(date)}><span>{shortDays[asDate(date).getUTCDay()]}</span><strong>{asDate(date).getUTCDate()}</strong><i/></button>)}</div>
    <div className="calendar-selected-date"><h4>{dateLabel(viewedDate)}</h4><span>Europe/Athens</span></div>
    <div className="calendar-day-summary"><div><strong>{active.filter(event => event.status === 'confirmed').length}</strong><span>επιβεβαιωμένα</span></div><div><strong>{active.filter(event => event.status === 'tentative').length}</strong><span>πιθανές δεσμεύσεις</span></div><div><strong>{(busyMinutes / 60).toLocaleString('el-GR', { maximumFractionDigits: 1 })}<small> ώρες</small></strong><span>στο ημερολόγιο · 07–24</span></div></div>
    <div className="calendar-legend">{Object.entries(categoryLabels).map(([key, label]) => <span key={key}><i className={`category-${key}`}/>{label}</span>)}<span><i className="tentative-key"/>Πιθανό / ομάδα</span></div>
    {overlapPairs.length > 0 && <div className="calendar-warning"><TriangleAlert size={17}/><div><strong>Υπάρχουν επικαλύψεις στο πρόγραμμά σου</strong><p>{overlapPairs.slice(0, 3).map(([first, second]) => `${first.title} ↔ ${second.title}`).join(' · ')}{overlapPairs.length > 3 ? '…' : ''}</p><small>Επιβεβαίωσε την εργαστηριακή ομάδα ή διόρθωσε τις ώρες παρακάτω.</small></div></div>}
    <div className="calendar-timeline" aria-label="Daily schedule timeline"><div className="timeline-axis">{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ top: `${index / 17 * 100}%` }}>{String(index + 7).padStart(2, '0')}:00</span>)}</div><div className="timeline-lane">{Array.from({ length: 18 }, (_, index) => <i className="timeline-gridline" key={index} style={{ top: `${index / 17 * 100}%` }}/>) }{shown.map(event => <button key={`${event.id}-${event.originDate}`} className={`timeline-event category-${event.category} ${event.status === 'tentative' ? 'tentative' : ''}`} style={eventPosition(event, shown)} title={`${event.title} · ${event.start}–${event.end}`} onClick={() => setExpandedEvent(current => current === event.id ? null : event.id)}><strong>{event.title}</strong><span>{event.start}–{event.end}{event.continuesNextDay ? ' (+1 ημέρα)' : ''}</span>{event.status === 'tentative' && <small>Ομάδα · χρειάζεται επιβεβαίωση</small>}</button>)}{!shown.length && <div className="calendar-empty"><Clock size={24}/><strong>Καμία καταχώριση 07:00–24:00</strong><span>Πρόσθεσε ό,τι έχεις κανονίσει.</span></div>}</div></div>
    {active.some(event => event.startMinutes < START) && <p className="calendar-source-note">Υπάρχει και δέσμευση πριν τις 07:00. Εμφανίζεται αναλυτικά στη λίστα παρακάτω.</p>}
    <div className="calendar-freewindow"><Clock size={16}/><div><strong>Κενά στο καταχωρισμένο πρόγραμμα</strong><p>{free.length ? free.join(' · ') : 'Δεν υπάρχει κενό τουλάχιστον 30 λεπτών μεταξύ 07:00–24:00.'}</p><small>Δεν υπολογίζονται μετακινήσεις. Οι πιθανές δεσμεύσεις παραμένουν δεσμευμένες μέχρι να τις διευκρινίσεις.</small></div></div>
    <section className="calendar-section"><header><h3>Οι δεσμεύσεις της ημέρας</h3><p>Το «i» στην πρόταση απάντησης παραπέμπει σε αυτές τις ώρες.</p></header><div className="calendar-day-events">{allOccurrences.map(event => <article key={`${event.id}-${event.originDate}`} className={`${event.enabled ? '' : 'event-disabled'} ${event.status === 'tentative' ? 'tentative' : ''}`}><span className={`event-color category-${event.category}`}/><div className="calendar-event-main"><button className="calendar-event-title" aria-expanded={expandedEvent === event.id} onClick={() => setExpandedEvent(current => current === event.id ? null : event.id)}><strong>{event.title}</strong><ChevronDown size={15}/></button><p>{event.start}–{event.end}{event.isCarryOver ? ' · από την προηγούμενη ημέρα' : event.continuesNextDay ? ' · συνεχίζει την επόμενη ημέρα' : ''}</p><span className="calendar-status">{!event.enabled ? 'Ανενεργό' : event.status === 'tentative' ? 'Πιθανό · ομάδα / επιλογή' : 'Επιβεβαιωμένο'}</span>{expandedEvent === event.id && <div className="calendar-event-details"><p>{event.source}</p>{event.notes && <p>{event.notes}</p>}<code>{event.id}</code><label>Κατάσταση<select aria-label={`Status ${event.title}`} value={event.status} onChange={change => patchEvent(event.id, { status: change.target.value as ScheduleEvent['status'] })}><option value="confirmed">Επιβεβαιωμένο</option><option value="tentative">Πιθανό</option></select></label></div>}</div><div className="calendar-event-actions"><label className="calendar-toggle" title="Συμπεριλαμβάνεται στις προτάσεις"><input type="checkbox" aria-label={`Include ${event.title}`} checked={event.enabled} onChange={change => patchEvent(event.id, { enabled: change.target.checked })}/><span/></label>{event.category === 'personal' && event.date && <button className="calendar-delete" aria-label={`Delete ${event.title}`} onClick={() => removeEvent(event.id)}><Trash2 size={15}/></button>}</div></article>)}{!allOccurrences.length && <p className="calendar-empty-note">Δεν έχεις καταχωρίσει δέσμευση για αυτή την ημέρα.</p>}</div></section>
    <details className="calendar-recurring"><summary><div><strong>Εβδομαδιαίο πρόγραμμα & ομάδες</strong><span>Μαθήματα, γυμναστήριο και κιθάρα</span></div><ChevronDown size={18}/></summary><p className="calendar-source-note">Οι ώρες εργαστηριακών ομάδων σημειώνονται ως πιθανές. Απενεργοποίησε όσες δεν ανήκουν στην ομάδα σου ή επιβεβαίωσε όσες παρακολουθείς. Η υποχρεωτική επιλογή μαθήματος κρατά πιθανή δέσμευση τη Δευτέρα 10:45–13:30. Επίλεξε ένα από τα δύο μαθήματα για επιβεβαίωση. Τα Αγγλικά είναι αρχικά ανενεργά.</p>{recurring.map(event => <div className={`recurring-event-row ${event.enabled ? '' : 'event-disabled'}`} key={event.id}><label><input type="checkbox" aria-label={`Weekly include ${event.title} ${dayNames[event.weekday!]}`} checked={event.enabled} onChange={change => patchEvent(event.id, { enabled: change.target.checked })}/><span><strong>{event.title}</strong><small>{dayNames[event.weekday!]} · {event.start}–{event.end}{event.optional ? ' · προαιρετικό / επιλογή' : ''}</small></span></label><div className="recurring-edit-fields"><label>Από<input type="time" aria-label={`Start ${event.id}`} value={event.start} onChange={change => { if (change.target.value) patchEvent(event.id, { start: change.target.value }); }}/></label><label>Έως<input type="time" aria-label={`End ${event.id}`} value={event.end} onChange={change => { if (change.target.value) patchEvent(event.id, { end: change.target.value }); }}/></label><select aria-label={`Weekly status ${event.id}`} value={event.status} onChange={change => patchEvent(event.id, { status: change.target.value as ScheduleEvent['status'] })}><option value="confirmed">Επιβεβαιωμένο</option><option value="tentative">Πιθανό / ομάδα</option></select></div></div>)}</details>
    <section className="calendar-section"><header><h3><Plus size={17}/> Πρόσθεσε ένα κανόνισμα</h3><p>Εμφανίζεται στο ημερολόγιο και επηρεάζει αμέσως τις απαντήσεις.</p></header><form className="calendar-add-form" onSubmit={addExtra}><label>Τι έχεις κανονίσει;<input aria-label="Extra event title" placeholder="π.χ. έξοδος, ομαδική εργασία, ραντεβού" value={extraTitle} onChange={event => setExtraTitle(event.target.value)} required maxLength={100}/></label><label>Ημερομηνία<input type="date" aria-label="Extra event date" value={extraDate} onChange={event => setExtraDate(event.target.value)} required/></label><div className="calendar-form-row"><label>Από<input type="time" aria-label="Extra event start" value={extraStart} onChange={event => setExtraStart(event.target.value)} required/></label><label>Έως<input type="time" aria-label="Extra event end" value={extraEnd} onChange={event => setExtraEnd(event.target.value)} required/></label></div>{extraEnd < extraStart && <p className="calendar-source-note">Η λήξη αφορά την επόμενη ημέρα.</p>}{formError && <p className="calendar-form-error" role="alert">{formError}</p>}<button type="submit" className="calendar-add-button"><Plus size={16}/>Προσθήκη στο ημερολόγιο</button></form></section>
    {status && <p className="calendar-feedback" role="status">{status}</p>}
    <p className="calendar-source-note calendar-bottom-note"><Info size={15}/>Το ωρολόγιο πρόγραμμα προέρχεται από την εικόνα ΕΜΠ, 3ο εξάμηνο 2025–2026. Η ένδειξη «Σήμερα στο demo» ορίζει την ημερομηνία ερμηνείας των μηνυμάτων· η περιήγηση στο ημερολόγιο δεν την αλλάζει. Η διαθεσιμότητα υπολογίζεται με κανόνες, χωρίς AI ή σύνδεση σε εξωτερικό ημερολόγιο.</p>
  </div>;
}

export default CalendarPanel;
