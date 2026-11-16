import type { AvailabilityResult } from '../src/domain/scheduleTypes';
import type { Intent, Persona, SuggestionContext } from '../src/domain/types';
import type { JsonSchema } from './llm';
import type { RetrievedSample } from './retrieval';

const weekdays = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const weekday = (date: string) => weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
export const INTENTS: Intent[] = ['invitation', 'meeting', 'assignment', 'confirmation', 'unknown'];

export const SYSTEM_PROMPT = `You are the "digital self" of one person (the owner). You draft the next message the owner would send in an ongoing conversation.
The owner always reviews your draft and decides whether to send it. You never act on their behalf.

Hard rules:
1. Write only the message body, in Greek, exactly as the owner would type it to this specific contact. No subject line, no quotation marks, no commentary.
2. Imitate the owner's writing samples for this contact: length, greeting, capitalisation, punctuation, emoji frequency and formality. They are the strongest evidence of the owner's voice. Prefer the owner's signature expressions when they fit naturally.
3. To a professor: formal plural (εσείς), complete sentences, polite greeting, no emoji, no slang.
4. Use the owner's grammatical gender for self-references.
5. Do not invent facts that are not in the conversation or the calendar check: no places, files, grades, deadlines, prices or promises. You do not know the owner's opinions, knowledge or work beyond this context, so never answer a substantive question on their behalf (e.g. how they solved an exercise, which approach they used, what something means). In that case reply as the samples show: acknowledge and ask a short clarifying question, or say the owner will check.
6. Never mention a clock time or a date that does not appear in the latest message, the conversation or the calendar check. Never propose an alternative day or time yourself.
7. The calendar check is computed by a deterministic engine and is authoritative. Follow its instruction exactly.
8. Keep it short: a chat reply is usually one or two sentences; an email reply at most four short sentences.`;

const relationshipLabel: Record<string, string> = {
  friend: 'close friend (informal)',
  classmate: 'classmate (friendly, practical)',
  professor: 'professor (formal)',
};

function calendarSection(availability?: AvailabilityResult): string {
  if (!availability || availability.status === 'not_scheduling') return '';
  const requested = availability.date && availability.start
    ? `${weekday(availability.date)} ${availability.date}, ${availability.start}${availability.end ? `–${availability.end}` : ''}${availability.durationAssumed ? ' (no end given; 60 minutes assumed)' : ''}`
    : 'not specified';
  const conflicts = availability.conflicts.map(event =>
    `- ${event.title}, ${event.originalStart}–${event.originalEnd} (${event.status === 'confirmed' ? 'confirmed' : 'tentative / possible'}) [${event.id}]`).join('\n');
  const instruction = {
    conflict: 'The owner is NOT available. Decline that time politely and briefly name the commitment (with its time range). Do not suggest any specific alternative; you may ask the contact to propose another time.',
    tentative: 'There is a possible but unconfirmed commitment. Do not accept or decline definitively: say there may be a commitment and that the owner needs to confirm the schedule first. Do not suggest alternatives.',
    available: 'No recorded commitment overlaps. The owner may say they appear free according to their schedule. Do not book or promise anything beyond what was asked; asking for details (e.g. where) is fine.',
    clarify: `The day or time is missing or ambiguous. Ask for exactly this clarification, phrased in the owner's register for this contact (greeting and formality as in the samples): «${availability.question ?? 'Ποια ημέρα και ώρα εννοείς;'}». Do not propose a day or time.`,
  }[availability.status];
  return `\n## Calendar check (authoritative)\nStatus: ${availability.status}\nRequested slot: ${requested}\nEngine reason: ${availability.reason}\n${conflicts ? `Conflicting events:\n${conflicts}\n` : ''}Instruction: ${instruction}\n`;
}

export function buildContextPrompt(persona: Persona, context: SuggestionContext, retrieved: RetrievedSample[], availability?: AvailabilityResult): string {
  const { contact } = context;
  const history = context.history.slice(-10).map(message =>
    `${message.author === 'owner' ? `${persona.firstName} (owner)` : contact.firstName}: ${message.text}`).join('\n');
  const samples = retrieved.map(({ sample, score }) =>
    `[${sample.id}] (similarity ${score.toFixed(2)})\n  ${contact.firstName} wrote: ${sample.contactText}\n  Owner replied: ${sample.ownerText}`).join('\n');
  return `## Owner
${persona.name}. ${persona.description}
Grammatical gender: ${persona.grammaticalGender ?? 'unknown (avoid gendered self-references)'}

## Channel
${context.channel === 'gmail' ? 'Gmail (email reply inside a thread)' : 'Instagram direct message'}

## Contact
${contact.name}, relationship: ${relationshipLabel[contact.relationship] ?? contact.relationship} (${contact.relationshipLabel})
Owner's style with this contact: ${contact.style.join('; ')}
Owner's signature expressions with this contact: ${contact.expressions.map(item => `«${item}»`).join(', ')}

## Owner's past messages to this contact (most relevant first)
${samples || '(none available)'}

## Conversation so far (oldest first)
${history}

## Latest incoming message
${context.lastIncoming?.text ?? ''}
${calendarSection(availability)}
Demo "today": ${context.referenceDate ? `${weekday(context.referenceDate)} ${context.referenceDate}` : 'unknown'} (Europe/Athens)`;
}

export const REPLY_SCHEMA: JsonSchema = {
  name: 'digital_self_reply',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['understanding', 'intent', 'reply', 'usedSourceIds', 'confidence'],
    properties: {
      understanding: { type: 'string', description: 'One short Greek sentence: what the contact wants from the owner.' },
      intent: { type: 'string', enum: INTENTS },
      reply: { type: 'string', description: 'The message body the owner would send.' },
      usedSourceIds: { type: 'array', items: { type: 'string' }, description: 'Ids of the owner samples whose style you followed.' },
      confidence: { type: 'number', description: '0 to 1: how sure you are this is what the owner would write.' },
    },
  },
};

export const COMPLETION_SCHEMA: JsonSchema = {
  name: 'digital_self_completion',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['continuation'],
    properties: { continuation: { type: 'string' } },
  },
};

export function replyInstruction(feedback?: string[]): string {
  return `\n\n## Task\nDraft the owner's reply to the latest incoming message.${feedback?.length ? `\nA previous draft was rejected by the owner's safety checks: ${feedback.join(' ')} Fix these problems.` : ''}`;
}

export function completionInstruction(draft: string): string {
  return `\n\n## Task\nThe owner has started typing the reply:\n«${draft}»\nReturn ONLY the text that should come right after what they typed, so that typed text + continuation is the reply the owner intends. Never repeat or change the typed text. Start with a space when beginning a new word; if the typed text ends mid-word, finish that word without a leading space. Keep it to at most one or two short sentences. If the typed text is already a complete reply, return an empty string.`;
}
