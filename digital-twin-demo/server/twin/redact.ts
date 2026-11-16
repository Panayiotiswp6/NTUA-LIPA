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

/**
 * Accent- and case-insensitive pattern for a name, applied to NFD text.
 * Greek names inflect (Μαρία/Μαρίας, Νίκος/Νίκο/Νίκου), so the last vowel or ς may change or extend.
 */
function namePattern(name: string) {
  const bare = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const inflects = bare.length > 3 && /[αεηιουωςσaeiouys]$/i.test(bare);
  const stem = inflects ? bare.slice(0, -1) : bare;
  const body = [...stem].map(char => (/\s/.test(char) ? '\\s+' : `${escape(char)}[\\u0300-\\u036f]*`)).join('');
  const ending = inflects ? '(?:\\p{L}[\\u0300-\\u036f]*){0,2}' : '';
  return new RegExp(`(?<![\\p{L}\\p{M}])${body}${ending}(?![\\p{L}\\p{M}])`, 'giu');
}

export function redact(input: string, options: RedactionOptions = {}): RedactionResult {
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
  replace('url', /https?:\/\/[^\s<>"]+/gi, url => /[?&#](token|key|sig|signature|auth|code|session|access_token|password|pwd)=/i.test(url) || /\/\/[^/@\s]+:[^/@\s]+@/.test(url) ? '[URL]' : null);
  replace('email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
  replace('iban', /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, '[IBAN]');
  replace('card', /\b(?:\d[ -]?){13,19}\b/g, match => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[CARD]' : null;
  });
  // ΑΜΚΑ: 11 digits, ΑΦΜ: 9 digits (with or without the label).
  replace('amka', /(?:ΑΜΚΑ|Α\.Μ\.Κ\.Α\.|amka)?[:\s]*(?<!\d)\d{11}(?!\d)/gi, match => (/\d{11}/.test(match) ? match.replace(/\d{11}/, '[AMKA]') : null));
  replace('phone', /(?<![\d\w])(?:\+|00)?30[ -]?(?:69\d|2\d{2})[ -]?\d{3}[ -]?\d{4}(?!\d)|(?<![\d\w])(?:69\d|2\d{2})[ -]?\d{3}[ -]?\d{4}(?!\d)/g, '[PHONE]');
  replace('afm', /(?:ΑΦΜ|Α\.Φ\.Μ\.|afm)?[:\s]*(?<!\d)\d{9}(?!\d)/gi, match => (/\d{9}/.test(match) ? match.replace(/\d{9}/, '[AFM]') : null));

  const names = [...(options.names ?? [])].filter(item => item.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
  if (names.length) {
    text = text.normalize('NFD');
    for (const { name, pseudonym } of names) replace('name', namePattern(name), pseudonym);
    text = text.normalize('NFC');
  }

  return { text, counts };
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
