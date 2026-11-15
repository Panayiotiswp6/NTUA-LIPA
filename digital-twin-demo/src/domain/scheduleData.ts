import type { ScheduleEvent, Weekday } from './scheduleTypes';

export const DEFAULT_REFERENCE_DATE = '2026-11-16';
export const SCHOOL_SCHEDULE_SOURCE = 'Ωρολόγιο πρόγραμμα ΕΜΠ · 3ο εξάμηνο · εικόνα αναφοράς 2025–2026';

const school = (id: string, title: string, weekday: Weekday, start: string, end: string, status: 'confirmed' | 'tentative' = 'confirmed', optional = false, notes?: string): ScheduleEvent => ({
  id, title, weekday, start, end, status, optional, enabled: !optional,
  category: 'school', source: SCHOOL_SCHEDULE_SOURCE, notes,
});
const groupNote = 'Ώρες εργαστηριακών ομάδων από την εικόνα. Δεν έχει δηλωθεί η δική σου ομάδα: πιθανή δέσμευση, όχι βεβαιωμένη παρουσία.';

export const initialScheduleEvents: ScheduleEvent[] = [
  school('school-signals-mon', 'Σήματα και Συστήματα', 1, '08:45', '10:30'),
  school('school-signals-wed', 'Σήματα και Συστήματα', 3, '08:45', '10:30'),
  school('school-electronics-lab-tue', 'Εισαγωγικό Εργαστήριο Ηλεκτρονικής και Τηλεπικοινωνιών', 2, '10:45', '17:00', 'tentative', false, groupNote),
  school('school-electronics-lab-wed', 'Εισαγωγικό Εργαστήριο Ηλεκτρονικής και Τηλεπικοινωνιών', 3, '12:45', '14:30', 'tentative', false, groupNote),
  school('school-electronics-fri', 'Εισαγωγικό Εργαστήριο Ηλεκτρονικής και Τηλεπικοινωνιών', 5, '12:45', '14:30'),
  school('school-cs-tue', 'Θεμελιώδη Θέματα Επιστήμης Υπολογιστών', 2, '17:45', '19:30'),
  school('school-cs-wed', 'Θεμελιώδη Θέματα Επιστήμης Υπολογιστών', 3, '10:45', '12:30'),
  school('school-cs-thu', 'Θεμελιώδη Θέματα Επιστήμης Υπολογιστών', 4, '17:45', '19:30'),
  school('school-cs-fri', 'Θεμελιώδη Θέματα Επιστήμης Υπολογιστών', 5, '10:45', '12:30'),
  school('school-measurements-lab-mon', 'Ηλεκτρικές Μετρήσεις · εργαστήριο', 1, '15:00', '21:00', 'tentative', false, groupNote),
  school('school-measurements-thu', 'Ηλεκτρικές Μετρήσεις', 4, '11:45', '14:30'),
  school('school-measurements-lab-thu', 'Ηλεκτρικές Μετρήσεις · εργαστήριο', 4, '15:00', '21:00', 'tentative', false, groupNote),
  school('school-probability-tue', 'Θεωρία Πιθανοτήτων & Στατιστική', 2, '08:45', '10:30'),
  school('school-probability-thu', 'Θεωρία Πιθανοτήτων & Στατιστική', 4, '10:45', '11:30'),
  school('school-probability-fri', 'Θεωρία Πιθανοτήτων & Στατιστική', 5, '08:45', '10:30'),
  school('school-elective-required-mon', 'Κατ’ επιλογήν υποχρεωτικό μάθημα', 1, '10:45', '13:30', 'tentative', false, 'Το πρόγραμμα απαιτεί ένα από Πολιτική Οικονομία ή Οργάνωση και Διοίκηση, στις ίδιες ώρες. Δεν έχει δηλωθεί ποιο: διατηρείται πιθανή δέσμευση μέχρι να επιλεγεί.'),
  school('school-elective-economy', 'Πολιτική Οικονομία · κατ’ επιλογήν', 1, '10:45', '13:30', 'tentative', true, 'Επίλεξε μόνο αν έχεις δηλώσει αυτό το κατ’ επιλογήν μάθημα.'),
  school('school-elective-management', 'Οργάνωση και Διοίκηση · κατ’ επιλογήν', 1, '10:45', '13:30', 'tentative', true, 'Εναλλακτικό κατ’ επιλογήν μάθημα, όχι επιπλέον υποχρεωτικό.'),
  school('school-english-mon', 'Αγγλική Γλώσσα · προαιρετικό', 1, '17:30', '19:15', 'tentative', true),
  ...([1, 2, 4, 5] as Weekday[]).map(weekday => ({
    id: `gym-${weekday}`, title: 'Γυμναστήριο', weekday, start: '20:00', end: '22:00', category: 'gym' as const,
    enabled: true, status: 'confirmed' as const, source: 'Σταθερή ρουτίνα που έδωσε ο χρήστης',
    notes: 'Οι καθημερινές ώρες 20:00–22:00 επιβεβαιώθηκαν από τον χρήστη. Μπορούν να αλλάξουν από το ημερολόγιο.',
  })),
  { id: 'gym-saturday', title: 'Γυμναστήριο', weekday: 6, start: '14:00', end: '16:00', category: 'gym', enabled: true, status: 'confirmed', source: 'Σταθερή ρουτίνα που έδωσε ο χρήστης' },
  ...([2, 4] as Weekday[]).map(weekday => ({
    id: `guitar-${weekday}`, title: 'Μάθημα κιθάρας', weekday, start: '16:00', end: '17:30', category: 'guitar' as const,
    enabled: true, status: 'confirmed' as const, source: 'Σταθερή ρουτίνα που έδωσε ο χρήστης',
  })),
  { id: 'extra-bouzoukia-sunday', title: 'Βραδινή έξοδος · μπουζούκια', date: '2026-11-22', start: '22:00', end: '02:00', category: 'personal', enabled: true, status: 'confirmed', source: 'Επεξεργάσιμο παράδειγμα έκτακτου κανονίσματος', notes: 'Ενδεικτικές ώρες για το demo· άλλαξέ τες ώστε να ταιριάζουν στο πραγματικό σου πρόγραμμα.' },
];
