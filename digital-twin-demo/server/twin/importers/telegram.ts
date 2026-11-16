import type { InputFile, ParsedSource, ParserPlugin, RawMessage } from '../types';

interface TelegramMessage {
  id: number;
  type: string;
  date: string;
  from?: string | null;
  from_id?: string;
  text?: string | Array<string | { type: string; text: string }>;
}
interface TelegramChat { id?: number; name?: string; type?: string; messages?: TelegramMessage[] }
interface TelegramExport extends TelegramChat {
  personal_information?: { user_id?: number; first_name?: string; last_name?: string; username?: string };
  chats?: { list?: TelegramChat[] };
}

function json(file: InputFile): TelegramExport | null {
  try { return JSON.parse(file.data.toString('utf8').replace(/^﻿/, '')) as TelegramExport; } catch { return null; }
}

/** Telegram stores formatted text as an array of plain strings and entity objects. */
export const telegramText = (text: TelegramMessage['text']) =>
  typeof text === 'string' ? text : (text ?? []).map(part => (typeof part === 'string' ? part : part.text ?? '')).join('');

const isSingleChat = (data: TelegramExport) => Array.isArray(data.messages) && typeof data.type === 'string';
const isFullExport = (data: TelegramExport) => Array.isArray(data.chats?.list);

/** Telegram Desktop "Export chat history" → result.json (one chat or the whole account). */
export const telegramParser: ParserPlugin = {
  kind: 'telegram',
  label: 'Telegram',
  detect(file) {
    if (!/\.json$/i.test(file.name)) return 0;
    const data = json(file);
    if (!data) return 0;
    if (isFullExport(data)) return 0.95;
    if (isSingleChat(data) && data.messages!.some(message => 'date' in message && 'type' in message)) return /result\.json$/i.test(file.name) ? 0.95 : 0.8;
    return 0;
  },
  parse(file): ParsedSource {
    const data = json(file)!;
    const chats = isFullExport(data) ? data.chats!.list! : [data];
    const messages: RawMessage[] = [];
    let service = 0;
    for (const chat of chats) {
      const title = chat.name || 'Telegram chat';
      for (const message of chat.messages ?? []) {
        if (message.type !== 'message') { service++; continue; }
        const text = telegramText(message.text).trim();
        if (!text || !message.from) continue;
        messages.push({ threadKey: `telegram:${chat.id ?? title}`, threadTitle: title, sender: message.from, senderHandle: message.from_id, sentAt: message.date.slice(0, 19), text });
      }
    }
    const me = data.personal_information;
    const ownerHints = me ? [[me.first_name, me.last_name].filter(Boolean).join(' '), me.user_id ? `user${me.user_id}` : '', me.username ?? ''].filter(Boolean) : [];
    return { kind: 'telegram', platform: 'telegram', filename: file.name, messages, documents: [], ownerHints, warnings: service ? [`${service} μηνύματα υπηρεσίας αγνοήθηκαν.`] : [] };
  },
};
