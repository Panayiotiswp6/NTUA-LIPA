import type { AvailabilityResult, ScheduleEvent } from './scheduleTypes';

export type Channel = 'instagram' | 'gmail';
export type Relationship = 'friend' | 'classmate' | 'professor';
export type Intent = 'invitation' | 'meeting' | 'assignment' | 'confirmation' | 'unknown';

export interface Persona {
  id: string;
  name: string;
  firstName: string;
  username: string;
  email: string;
  avatar: string;
  avatarPosition?: string;
  avatarSize?: string;
  description: string;
  /** Greek grammatical gender for self-references ("διαθέσιμος" / "διαθέσιμη"). */
  grammaticalGender?: 'masculine' | 'feminine';
}

export interface Contact {
  id: string;
  channel: Channel;
  name: string;
  firstName: string;
  username: string;
  email: string;
  avatar: string;
  avatarPosition?: string;
  avatarSize?: string;
  relationship: Relationship;
  relationshipLabel: string;
  style: string[];
  expressions: string[];
}

export interface Message {
  id: string;
  author: 'owner' | 'contact';
  text: string;
  time: string;
}

export interface Thread {
  id: string;
  channel: Channel;
  contactId: string;
  subject: string;
  messages: Message[];
  unread: boolean;
}

export interface SourceSample {
  id: string;
  contactId: string;
  channel: Channel;
  intent: Intent;
  ownerText: string;
  contactText: string;
  traits: string[];
}

export interface SuggestionContext {
  channel: Channel;
  contact: Contact;
  history: Message[];
  lastIncoming?: Message;
  draft: string;
  sources: SourceSample[];
  calendarEvents?: ScheduleEvent[];
  referenceDate?: string;
  meetingDurationMinutes?: number;
}

export type SuggestionEngine = 'openai' | 'deterministic';

/** How a suggestion was produced. Optional so a provider without AI keeps the same contract. */
export interface SuggestionMeta {
  engine: SuggestionEngine;
  /** Model id when engine is 'openai'. */
  model?: string;
  /** One sentence: what the twin understood the contact is asking for. */
  understanding?: string;
  /** Semantic retrieval of the owner's writing samples, best first. */
  retrieval?: Array<{ id: string; score: number }>;
  /** Deterministic checks applied to the model output before it reaches the composer. */
  guard?: { passed: boolean; checks: string[]; issues: string[] };
  /** Why the deterministic engine answered instead of the model. */
  fallbackReason?: string;
  latencyMs?: number;
}

export interface Suggestion {
  /** A complete reply for suggestReply; only the appendable suffix for autocomplete. */
  text: string;
  sourceIds: string[];
  traits: string[];
  intent: Intent;
  availability?: AvailabilityResult;
  meta?: SuggestionMeta;
}

export interface SuggestionProvider {
  suggestReply(context: SuggestionContext): Promise<Suggestion | null>;
  autocomplete(context: SuggestionContext): Promise<Suggestion | null>;
}

export interface SourceRepository {
  getPersona(): Persona;
  getContacts(channel?: Channel): Contact[];
  getContact(id: string): Contact | undefined;
  getThreads(channel?: Channel): Thread[];
  getSources(contactId: string): SourceSample[];
  getSource(id: string): SourceSample | undefined;
}
