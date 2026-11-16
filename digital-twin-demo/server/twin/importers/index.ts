import type { InputFile, ParsedSource, ParserPlugin } from '../types';
import { instagramParser, messengerParser } from './meta';
import { mboxParser } from './mbox';
import { notesParser } from './notes';
import { telegramParser } from './telegram';
import { whatsappParser } from './whatsapp';
import { extractZip, isZip } from './zip';

/** Adding a platform means adding one plugin here. */
export const PARSERS: ParserPlugin[] = [whatsappParser, telegramParser, mboxParser, instagramParser, messengerParser, notesParser];

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export interface DetectionResult {
  sources: ParsedSource[];
  /** Files that no parser recognised, or that were skipped inside archives (media, unknown types). */
  unrecognised: string[];
}

export function detectParser(file: InputFile): ParserPlugin | null {
  let best: { parser: ParserPlugin; score: number } | null = null;
  for (const parser of PARSERS) {
    const score = parser.detect(file);
    if (score > 0 && (!best || score > best.score)) best = { parser, score };
  }
  return best && best.score >= 0.3 ? best.parser : null;
}

/** Auto-detect and parse one upload: a single export file or an archive of them (nested archives included). */
export async function parseUpload(file: InputFile): Promise<DetectionResult> {
  const files = isZip(file.data) ? (await extractZip(file.data, `${file.name}/`)) : { files: [file], skipped: [] };
  const sources: ParsedSource[] = [];
  const unrecognised = [...files.skipped];
  for (const inner of files.files) {
    const parser = detectParser(inner);
    if (!parser) { unrecognised.push(inner.name); continue; }
    const parsed = await parser.parse(inner);
    if (parsed.messages.length || parsed.documents.length) sources.push(parsed);
  }
  return { sources, unrecognised };
}
