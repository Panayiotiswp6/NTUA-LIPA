export type Platform = 'whatsapp' | 'telegram' | 'gmail' | 'instagram' | 'messenger' | 'notes';
export type SourceKind = 'whatsapp' | 'telegram' | 'gmail_mbox' | 'instagram' | 'messenger' | 'document';
export type Relationship = 'friend' | 'family' | 'study' | 'work' | 'unknown';
export type Lang = 'el' | 'en' | 'greeklish' | 'mixed' | 'none';

/** One file as uploaded or found inside an archive. */
export interface InputFile {
  /** Path inside the upload (archives keep their inner folders). */
  name: string;
  data: Buffer;
}

/** A message in platform-neutral form, before storage. */
export interface RawMessage {
  threadKey: string;
  threadTitle: string;
  sender: string;
  senderHandle?: string;
  /** Local wall-clock time, ISO without zone (exports rarely carry one reliably). */
  sentAt: string;
  text: string;
}

export interface RawDocument {
  title: string;
  text: string;
}

export interface ParsedSource {
  kind: SourceKind;
  platform: Platform;
  filename: string;
  messages: RawMessage[];
  documents: RawDocument[];
  /** Names or handles that are probably the owner (mbox account, Telegram personal info). */
  ownerHints: string[];
  warnings: string[];
}

/** Every format is a plugin behind the same two calls. */
export interface ParserPlugin {
  kind: SourceKind;
  label: string;
  /** 0 = not this format, 1 = certain. */
  detect(file: InputFile): number;
  parse(file: InputFile): ParsedSource | Promise<ParsedSource>;
}
