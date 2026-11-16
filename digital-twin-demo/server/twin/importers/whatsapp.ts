import type { InputFile, ParsedSource, ParserPlugin, RawMessage } from '../types';

/**
 * WhatsApp "Export chat" text, Android and iOS, any locale we have seen:
 *   Android: 16/11/2026, 10:15 - Μαρία: γεια
 *            16/11/26, 10:15 π.μ. - Μαρία: γεια
 *   iOS:     [16/11/2026, 10:15:32] Μαρία: γεια
 *            [16/11/26 10:15:32 μ.μ.] Μαρία: γεια
 */
const HEADER = /^‎?\[?(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?|π\.?\s?μ\.?|μ\.?\s?μ\.?)?\]?\s*(?:[-–]\s*)?(.*)$/i;
const SENDER = /^‎?([^:‎]{1,80}?):\s?([\s\S]*)$/;
const MEDIA = /^‎?(<media omitted>|<παραλείφθηκαν πολυμέσα>|<παραλείφθηκε πολυμέσο>|‎?(image|video|audio|sticker|gif|document) omitted|‎?(εικόνα|βίντεο|ήχος|αυτοκόλλητο|έγγραφο) (παραλείφθηκε|παραλείφθηκαν)|this message was deleted|αυτό το μήνυμα διαγράφηκε|<this message was edited>)$/i;

const SYSTEM_TEXT = /(κρυπτογραφημένα από άκρο σε άκρο|end-to-end encrypted|δημιούργησε την ομάδα|created group|πρόσθεσε τον|added you|άλλαξε τον κωδικό ασφαλείας|security code changed)/i;

const decode = (file: InputFile) => file.data.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/** Title from the export file or the zip it came in: "WhatsApp Chat with Μαρία.txt", "Συνομιλία WhatsApp με Μαρία.txt". */
export function whatsappTitle(name: string) {
  const parts = name.split('/');
  const base = parts.at(-1)!.replace(/\.(txt|zip)$/i, '');
  const candidate = base === '_chat' ? (parts.at(-2) ?? 'WhatsApp').replace(/\.zip$/i, '') : base;
  return candidate.replace(/^(WhatsApp Chat (with|-)|Συνομιλία WhatsApp με|Συνομιλία WhatsApp -)\s*/i, '').trim() || 'WhatsApp';
}

interface Header { a: number; b: number; year: number; hour: number; minute: number; second: number; meridiem?: string; rest: string }

function parseHeader(line: string): Header | null {
  const match = HEADER.exec(line);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  return { a: Number(match[1]), b: Number(match[2]), year, hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0), meridiem: match[7], rest: match[8] };
}

function to24h(hour: number, meridiem?: string) {
  if (!meridiem) return hour;
  const pm = /^(p|μ\.?\s?μ)/i.test(meridiem.replace(/\s/g, ''));
  if (pm && hour < 12) return hour + 12;
  if (!pm && hour === 12) return 0;
  return hour;
}

const pad = (value: number) => String(value).padStart(2, '0');

export const whatsappParser: ParserPlugin = {
  kind: 'whatsapp',
  label: 'WhatsApp',
  detect(file) {
    if (!/\.txt$/i.test(file.name)) return 0;
    const lines = decode(file).split('\n').filter(Boolean).slice(0, 30);
    if (!lines.length) return 0;
    const headers = lines.filter(line => parseHeader(line)).length;
    const share = headers / lines.length;
    return share >= 0.5 ? Math.min(1, 0.6 + share / 2) : /whatsapp|_chat\.txt$/i.test(file.name) && headers ? 0.5 : 0;
  },
  parse(file): ParsedSource {
    const lines = decode(file).split('\n');
    const title = whatsappTitle(file.name);
    const headers = lines.map(parseHeader);
    // Day-first is the Greek default; switch only when the data proves month-first (a "day" above 12 in position b).
    const monthFirst = headers.some(header => header && header.b > 12) && !headers.some(header => header && header.a > 12);
    const messages: RawMessage[] = [];
    const warnings: string[] = [];
    let current: RawMessage | null = null;
    let system = 0, media = 0;
    const flush = () => {
      if (!current) return;
      current.text = current.text.replace(/‎/g, '').trim();
      if (!current.text) { current = null; return; }
      if (MEDIA.test(current.text)) media++;
      else if (SYSTEM_TEXT.test(current.text)) system++;
      else messages.push(current);
      current = null;
    };
    lines.forEach((line, index) => {
      const header = headers[index];
      if (!header) {
        // Continuation of a multi-line message.
        if (current) current.text += `\n${line}`;
        return;
      }
      flush();
      const day = monthFirst ? header.b : header.a;
      const month = monthFirst ? header.a : header.b;
      const sender = SENDER.exec(header.rest);
      if (!sender) { system++; return; }
      current = {
        threadKey: `whatsapp:${title}`,
        threadTitle: title,
        sender: sender[1].trim(),
        sentAt: `${header.year}-${pad(month)}-${pad(day)}T${pad(to24h(header.hour, header.meridiem))}:${pad(header.minute)}:${pad(header.second)}`,
        text: sender[2],
      };
    });
    flush();
    if (media) warnings.push(`${media} πολυμέσα παραλείφθηκαν (μόνο κείμενο).`);
    if (system) warnings.push(`${system} μηνύματα συστήματος αγνοήθηκαν.`);
    return { kind: 'whatsapp', platform: 'whatsapp', filename: file.name, messages, documents: [], ownerHints: [], warnings };
  },
};
