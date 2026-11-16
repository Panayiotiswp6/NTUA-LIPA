import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import type { ParsedSource, ParserPlugin, RawMessage } from '../types';
import { athensLocal } from './meta';

/** Split an mbox file on its "From " postmark lines and undo the ">From " escaping. */
export function splitMbox(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n(?=From [^\n]*\n)/)
    .map(chunk => chunk.replace(/^From [^\n]*\n/, '').replace(/^>(>*From )/gm, '$1'))
    .filter(chunk => /^[\w-]+:/m.test(chunk));
}

/**
 * Keep only what the sender wrote in this email: drop quoted history ("On … wrote:", "Στις … έγραψε:",
 * forwarded headers, "> " lines) and the signature block.
 */
export function stripQuotedAndSignature(body: string): string {
  let text = `\n${body.replace(/\r\n?/g, '\n')}\n`;
  text = text.replace(/\n(?:On\s|Στις\s)[^\n]*(?:\n[^\n]*){0,2}?(?:wrote|έγραψε):[ \t]*\n[\s\S]*$/i, '\n');
  text = text.replace(/\n-{2,}\s*(Original Message|Forwarded message|Αρχικό μήνυμα|Προωθημένο μήνυμα)\s*-{2,}[\s\S]*$/i, '\n');
  text = text.split('\n').filter(line => !/^\s*>/.test(line)).join('\n');
  text = text.replace(/\n--\s*\n[\s\S]*$/, '\n');
  text = text.replace(/\n(Sent from my [^\n]+|Στάλθηκε από [^\n]+|Αποστολή από [^\n]+)\s*$/i, '\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

const firstAddress = (value?: AddressObject | AddressObject[]) => (Array.isArray(value) ? value[0] : value)?.value?.[0];
const allAddresses = (value?: AddressObject | AddressObject[]) => (Array.isArray(value) ? value : value ? [value] : []).flatMap(item => item.value.map(address => address.address?.toLowerCase()).filter(Boolean) as string[]);
const cleanSubject = (subject?: string) => (subject ?? '(χωρίς θέμα)').replace(/^((re|fwd?|aw|απ|σχετ|προωθ)\s*:\s*)+/i, '').trim() || '(χωρίς θέμα)';

/** Google Takeout "Mail" export (.mbox), alone or inside the Takeout zip. */
export const mboxParser: ParserPlugin = {
  kind: 'gmail_mbox',
  label: 'Gmail (Takeout .mbox)',
  detect(file) {
    if (/\.mbox$/i.test(file.name)) return 0.95;
    const head = file.data.subarray(0, 2000).toString('utf8');
    return /^From \S+.*\n(?:[\w-]+:.*\n)+/m.test(head) && /^(Message-ID|Subject|Date):/im.test(head) ? 0.7 : 0;
  },
  async parse(file): Promise<ParsedSource> {
    const chunks = splitMbox(file.data.toString('utf8'));
    const parsed: Array<{ mail: ParsedMail; labels: string }> = [];
    const warnings: string[] = [];
    for (const chunk of chunks) {
      try {
        const mail = await simpleParser(chunk, { skipHtmlToText: false, skipImageLinks: true, skipTextLinks: true });
        parsed.push({ mail, labels: String(mail.headers.get('x-gmail-labels') ?? '') });
      } catch {
        warnings.push('Ένα email δεν διαβάστηκε και παραλείφθηκε.');
      }
    }
    // The account owner: the sender of mail labelled Sent, otherwise the address present in most emails.
    const counts = new Map<string, number>();
    for (const { mail, labels } of parsed) {
      const weight = /(^|,)\s*(sent|απεσταλμένα)\s*(,|$)/i.test(labels) ? 5 : 1;
      for (const address of new Set([...allAddresses(mail.from), ...allAddresses(mail.to), ...allAddresses(mail.cc)])) counts.set(address, (counts.get(address) ?? 0) + (allAddresses(mail.from).includes(address) ? weight : 1));
    }
    const account = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const messages: RawMessage[] = [];
    let empty = 0;
    for (const { mail } of parsed) {
      const from = firstAddress(mail.from);
      if (!from?.address || !mail.date) continue;
      // Prefer text/plain; mailparser derives text from HTML when that is all there is.
      const body = stripQuotedAndSignature(mail.text ?? '');
      if (!body) { empty++; continue; }
      const references = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [];
      const gmailThread = mail.headers.get('x-gm-thrid');
      const root = gmailThread ? String(gmailThread) : references[0] ?? mail.inReplyTo ?? mail.messageId ?? `${cleanSubject(mail.subject)}`;
      messages.push({
        threadKey: `gmail:${root}`,
        threadTitle: cleanSubject(mail.subject),
        sender: from.name || from.address,
        senderHandle: from.address.toLowerCase(),
        sentAt: athensLocal(mail.date.getTime()),
        text: body,
      });
    }
    if (empty) warnings.push(`${empty} emails χωρίς δικό τους κείμενο παραλείφθηκαν.`);
    return { kind: 'gmail_mbox', platform: 'gmail', filename: file.name, messages, documents: [], ownerHints: account ? [account] : [], warnings };
  },
};
