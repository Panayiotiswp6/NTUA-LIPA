export type ScheduleCategory = 'school' | 'gym' | 'guitar' | 'personal';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Local wall-clock times and dates in Europe/Athens; end <= start means overnight. */
export interface ScheduleEvent {
  id: string;
  title: string;
  weekday?: Weekday;
  date?: string;
  start: string;
  end: string;
  category: ScheduleCategory;
  enabled: boolean;
  status: 'confirmed' | 'tentative';
  source: string;
  optional?: boolean;
  notes?: string;
}

/** A date-specific, clipped segment. An overnight event produces two segments. */
export interface ScheduleOccurrence extends ScheduleEvent {
  date: string;
  originDate: string;
  originalStart: string;
  originalEnd: string;
  startMinutes: number;
  endMinutes: number;
  isCarryOver: boolean;
  continuesNextDay: boolean;
}

export type AvailabilityStatus = 'available' | 'conflict' | 'tentative' | 'clarify' | 'not_scheduling';
export interface AvailabilityResult {
  status: AvailabilityStatus;
  date?: string;
  start?: string;
  end?: string;
  endDate?: string;
  durationMinutes?: number;
  durationAssumed?: boolean;
  reason: string;
  question?: string;
  conflicts: ScheduleOccurrence[];
  sourceIds: string[];
}

export interface ScheduleOverlap {
  first: ScheduleOccurrence;
  second: ScheduleOccurrence;
  startMinutes: number;
  endMinutes: number;
}
