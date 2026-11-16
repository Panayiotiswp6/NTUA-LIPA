import type { InputFile, ParsedSource, ParserPlugin, RawMessage } from '../types';

interface MetaMessage { sender_name?: string; timestamp_ms?: number; content?: string; is_unsent?: boolean }
interface MetaThread { participants?: Array<{ name: string }>; messages?: MetaMessage[]; title?: string; thread_path?: string; joinable_mode?: unknown }

/**
 * Meta's "Download your information" JSON writes UTF-8 bytes as if each byte were a Latin-1 character
 * ("ÎÎ±Î»Î·Î¼Î­ÏÎ±" instead of "Καλημέρα"). Re-decode, but only when the result is valid UTF-8.
 */
export function fixMojibake(text: string): string {
  if (!text || ![...text].every(char => char.charCodeAt(0) <= 0xff) || !/[\u0080-ÿ]/.test(text)) return text;
  const decoded = Buffer.from(text, 'latin1').toString('utf8');
  return decoded.includes('�') ? text : decoded;
}

function json(file: InputFile): MetaThread | null {
  try { return JSON.parse(file.data.toString('utf8')) as MetaThread; } catch { return null; }
}

const isMetaThread = (data: MetaThread | null) => !!data && Array.isArray(data.participants) && Array.isArray(data.messages) && data.messages.every(message => 'timestamp_ms' in message);

function pad(value: number) { return String(value).padStart(2, '0'); }
/** Athens wall-clock time for a UTC timestamp (exports are UTC). */
export function athensLocal(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(timestampMs)).reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${pad(Number(parts.hour))}:${parts.minute}:${parts.second}`;
}

function parseThread(file: InputFile, platform: 'instagram' | 'messenger'): ParsedSource {
  const data = json(file)!;
  const participants = (data.participants ?? []).map(person => fixMojibake(person.name));
  const title = fixMojibake(data.title ?? '') || participants.join(', ');
  const key = data.thread_path ?? file.name.split('/').slice(-2, -1)[0] ?? title;
  const messages: RawMessage[] = [];
  let skipped = 0;
  // Meta lists newest first.
  for (const message of [...(data.messages ?? [])].reverse()) {
    if (!message.content || !message.sender_name || message.is_unsent) { skipped++; continue; }
    messages.push({ threadKey: `${platform}:${key}`, threadTitle: title, sender: fixMojibake(message.sender_name), sentAt: athensLocal(message.timestamp_ms!), text: fixMojibake(message.content) });
  }
  return {
    kind: platform, platform, filename: file.name, messages, documents: [],
    // In a personal export the owner is a participant of every thread; the ingest step uses that.
    ownerHints: [],
    warnings: skipped ? [`${skipped} μηνύματα χωρίς κείμενο (φωτογραφίες, reactions) παραλείφθηκαν.`] : [],
  };
}

const platformFor = (file: InputFile, data: MetaThread | null): 'instagram' | 'messenger' =>
  /instagram/i.test(file.name) ? 'instagram' : /facebook|messenger/i.test(file.name) || (data && 'joinable_mode' in data) ? 'messenger' : 'instagram';

function plugin(platform: 'instagram' | 'messenger'): ParserPlugin {
  return {
    kind: platform,
    label: platform === 'instagram' ? 'Instagram' : 'Messenger',
    detect(file) {
      if (!/\.json$/i.test(file.name)) return 0;
      const data = json(file);
      if (!isMetaThread(data)) return 0;
      return platformFor(file, data) === platform ? (/message_\d+\.json$/i.test(file.name) ? 0.95 : 0.85) : 0;
    },
    parse: file => parseThread(file, platform),
  };
}

export const instagramParser = plugin('instagram');
export const messengerParser = plugin('messenger');
