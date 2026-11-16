/**
 * PII redaction applied before any text can leave the machine (LLM calls) and in every UI that shows
 * other people's messages. Deterministic and unit-tested; it errs on the side of redacting.
 */

export interface RedactionOptions {
  /** Other people's names → consistent pseudonyms (e.g. "Μαρία" → "Person_A"). Longest names first. */
  names?: Array<{ name: string; pseudonym: string }>;
}

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
}

function luhn(digits: string) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const strip = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Cheap comparable form: no accents, lower case. Only used to decide whether a pattern can match at all. */
const plain = (value: string) => strip(value).toLowerCase().replace(/ς/g, 'σ');

/**
 * Accent- and case-insensitive pattern for a name, applied to NFD text.
 * Greek names inflect (Μαρία/Μαρίας, Νίκος/Νίκο/Νίκου), so the last vowel or ς may change or extend.
 */
function namePattern(name: string) {
  const bare = strip(name).trim();
  const inflects = bare.length > 3 && /[αεηιουωςσaeiouys]$/i.test(bare);
  const stem = inflects ? bare.slice(0, -1) : bare;
  const body = [...stem].map(char => (/\s/.test(char) ? '\\s+' : `${escape(char)}[\\u0300-\\u036f]*`)).join('');
  const ending = inflects ? '(?:\\p{L}[\\u0300-\\u036f]*){0,2}' : '';
  return {
    pattern: new RegExp(`(?<![\\p{L}\\p{M}])${body}${ending}(?![\\p{L}\\p{M}])`, 'giu'),
    // The first word of the stem must be present for the pattern to match; a substring test is far cheaper than the regex.
    probe: plain(stem).split(/\s+/)[0],
  };
}

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const AMKA = /(?:ΑΜΚΑ|Α\.Μ\.Κ\.Α\.|amka)?[:\s]*(?<!\d)\d{11}(?!\d)/gi;
const PHONE = /(?<![\d\w])(?:\+|00)?30[ -]?(?:69\d|2\d{2})[ -]?\d{3}[ -]?\d{4}(?!\d)|(?<![\d\w])(?:69\d|2\d{2})[ -]?\d{3}[ -]?\d{4}(?!\d)/g;
const AFM = /(?:ΑΦΜ|Α\.Φ\.Μ\.|afm)?[:\s]*(?<!\d)\d{9}(?!\d)/gi;
const NINE_DIGITS = /(?:\d[^\d]{0,2}){9}/;

export type Redactor = (input: string) => RedactionResult;

/**
 * Compile the name patterns once and reuse them for many texts. Importing a real export redacts tens of
 * thousands of messages, so each pattern is only run when a cheap check says it can match.
 */
export function createRedactor(options: RedactionOptions = {}): Redactor {
  const names = [...(options.names ?? [])]
    .filter(item => item.name.trim().length >= 2)
    .sort((a, b) => b.name.length - a.name.length)
    .map(item => ({ ...namePattern(item.name), pseudonym: item.pseudonym }));

  return (input: string) => {
    const counts: Record<string, number> = {};
    let text = input.normalize('NFC');
    const replace = (kind: string, pattern: RegExp, replacement: string | ((match: string) => string | null)) => {
      text = text.replace(pattern, (match: string) => {
        const value = typeof replacement === 'function' ? replacement(match) : replacement;
        if (value === null) return match;
        counts[kind] = (counts[kind] ?? 0) + 1;
        return value;
      });
    };

    // URLs that carry credentials or tokens; plain links stay readable.
    if (text.includes('://')) replace('url', URL_PATTERN, url => /[?&#](token|key|sig|signature|auth|code|session|access_token|password|pwd)=/i.test(url) || /\/\/[^/@\s]+:[^/@\s]+@/.test(url) ? '[URL]' : null);
    if (text.includes('@')) replace('email', EMAIL, '[EMAIL]');
    // Every identifier below needs at least nine digits close together.
    if (NINE_DIGITS.test(text)) {
      replace('iban', IBAN, '[IBAN]');
      replace('card', CARD, match => {
        const digits = match.replace(/\D/g, '');
        return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[CARD]' : null;
      });
      // ΑΜΚΑ: 11 digits, ΑΦΜ: 9 digits (with or without the label).
      replace('amka', AMKA, match => (/\d{11}/.test(match) ? match.replace(/\d{11}/, '[AMKA]') : null));
      replace('phone', PHONE, '[PHONE]');
      replace('afm', AFM, match => (/\d{9}/.test(match) ? match.replace(/\d{9}/, '[AFM]') : null));
    }

    if (names.length) {
      const probeText = plain(text);
      const candidates = names.filter(item => probeText.includes(item.probe));
      if (candidates.length) {
        text = text.normalize('NFD');
        for (const { pattern, pseudonym } of candidates) replace('name', pattern, pseudonym);
        text = text.normalize('NFC');
      }
    }
    return { text, counts };
  };
}

/** One-off redaction. For many texts with the same names, use createRedactor. */
export function redact(input: string, options: RedactionOptions = {}): RedactionResult {
  return createRedactor(options)(input);
}

/** Pseudonym for the n-th other person: Person_A … Person_Z, Person_AA … */
export function pseudonymFor(index: number) {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Person_${label}`;
}
