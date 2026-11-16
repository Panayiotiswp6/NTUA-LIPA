import type { ParsedSource, ParserPlugin } from '../types';

/** Markdown and plain-text notes (also Notion / Obsidian exports, which are folders of .md). Used as knowledge, not as style. */
export const notesParser: ParserPlugin = {
  kind: 'document',
  label: 'Σημειώσεις / έγγραφα',
  detect(file) {
    if (/\.(md|markdown)$/i.test(file.name)) return 0.9;
    // Plain text that is not a chat export (the WhatsApp parser scores those higher).
    return /\.txt$/i.test(file.name) ? 0.3 : 0;
  },
  parse(file): ParsedSource {
    const text = file.data.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    const heading = /^#\s+(.+)$/m.exec(text)?.[1];
    const title = heading ?? file.name.split('/').at(-1)!.replace(/\.(md|markdown|txt)$/i, '').replace(/\s+[0-9a-f]{32}$/, '');
    return { kind: 'document', platform: 'notes', filename: file.name, messages: [], documents: text ? [{ title, text }] : [], ownerHints: [], warnings: [] };
  },
};
