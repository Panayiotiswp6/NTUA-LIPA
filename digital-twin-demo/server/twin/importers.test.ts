import { describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { openDatabase } from './db';
import { detectParser, parseUpload } from './importers';
import { fixMojibake, instagramParser } from './importers/meta';
import { mboxParser, splitMbox, stripQuotedAndSignature } from './importers/mbox';
import { telegramParser } from './importers/telegram';
import { whatsappParser } from './importers/whatsapp';
import { UnsafeArchiveError, extractZip } from './importers/zip';
import { importUpload, ownerState, setOwner } from './ingest';
import { pseudonymFor, redact } from './redact';
import { detectLang } from './text';
import type { InputFile } from './types';

const file = (name: string, content: string | Buffer): InputFile => ({ name, data: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8') });

function zip(entries: Array<[string, string | Buffer]>, compress = true): Promise<Buffer> {
  return new Promise(resolve => {
    const archive = new yazl.ZipFile();
    for (const [name, content] of entries) archive.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name, { compress });
    const chunks: Buffer[] = [];
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.end();
  });
}

describe('WhatsApp parser', () => {
  const android = [
    '16/5/26, 9:00 π.μ. - Τα μηνύματα και οι κλήσεις είναι κρυπτογραφημένα από άκρο σε άκρο.',
    '16/11/26, 10:15 π.μ. - Μαρία Γεωργίου: πάμε για καφέ;',
    '16/11/26, 12:05 μ.μ. - Αλέξανδρος Νικολάου: ναι!',
    'στον πλάτανο;',
    '16/11/26, 12:00 π.μ. - Μαρία Γεωργίου: <Παραλείφθηκαν πολυμέσα>',
    '16/11/26, 9:30 μ.μ. - Μαρία Γεωργίου: τέλεια 🙂',
  ].join('\n');

  it('reads Greek 12-hour times, multi-line messages, and skips system and media lines', () => {
    const source = whatsappParser.parse(file('WhatsApp Chat with Μαρία Γεωργίου.txt', android)) as ReturnType<typeof whatsappParser.parse> & { messages: Array<{ sentAt: string; text: string; sender: string; threadTitle: string }> };
    expect(source.messages.map(message => [message.sentAt, message.sender, message.text])).toEqual([
      ['2026-11-16T10:15:00', 'Μαρία Γεωργίου', 'πάμε για καφέ;'],
      ['2026-11-16T12:05:00', 'Αλέξανδρος Νικολάου', 'ναι!\nστον πλάτανο;'],
      ['2026-11-16T21:30:00', 'Μαρία Γεωργίου', 'τέλεια 🙂'],
    ]);
    expect(source.messages[0].threadTitle).toBe('Μαρία Γεωργίου');
    expect(source.warnings.join(' ')).toMatch(/πολυμέσα/);
  });

  it('reads iOS exports with seconds, invisible marks and CRLF', () => {
    const ios = '[03/11/26 21:04:09] Γιώργος Καραλής: ‎Τα μηνύματα και οι κλήσεις είναι κρυπτογραφημένα από άκρο σε άκρο.\r\n[03/11/26 21:05:10] Γιώργος Καραλής: ela re\r\n[03/11/26 21:06:00] Αλέξανδρος Νικολάου: ‎image omitted\r\n';
    const source = whatsappParser.parse(file('WhatsApp Chat - Γιώργος Καραλής.zip/_chat.txt', ios));
    expect(source.messages).toEqual([{ threadKey: 'whatsapp:Γιώργος Καραλής', threadTitle: 'Γιώργος Καραλής', sender: 'Γιώργος Καραλής', sentAt: '2026-11-03T21:05:10', text: 'ela re' }]);
  });

  it('detects month-first dates only when the data proves it', () => {
    const us = '11/16/26, 9:15 PM - Maria: hi\n11/17/26, 10:00 AM - Alex: hello\n';
    const source = whatsappParser.parse(file('chat.txt', us));
    expect(source.messages.map(message => message.sentAt)).toEqual(['2026-11-16T21:15:00', '2026-11-17T10:00:00']);
  });
});

describe('Telegram parser', () => {
  it('flattens entity arrays, skips service messages and reads the owner profile', () => {
    const data = JSON.stringify({
      personal_information: { user_id: 7, first_name: 'Αλέξανδρος', last_name: 'Νικολάου' },
      chats: { list: [{ id: 1, name: 'Ομάδα', type: 'private_group', messages: [
        { id: 1, type: 'service', date: '2026-11-01T10:00:00', actor: 'x', action: 'create_group' },
        { id: 2, type: 'message', date: '2026-11-01T10:01:00', from: 'Νίκος', from_id: 'user8', text: ['Δες ', { type: 'bold', text: 'αυτό' }] },
      ] }] },
    });
    const input = file('result.json', data);
    expect(detectParser(input)).toBe(telegramParser);
    const source = telegramParser.parse(input) as Awaited<ReturnType<typeof telegramParser.parse>>;
    expect(source.messages).toHaveLength(1);
    expect(source.messages[0].text).toBe('Δες αυτό');
    expect(source.ownerHints).toContain('Αλέξανδρος Νικολάου');
  });
});

describe('Instagram / Messenger parser', () => {
  it('repairs Meta mojibake so Greek is readable, and only when it is mojibake', () => {
    const broken = Buffer.from('Καλημέρα 🙂', 'utf8').toString('latin1');
    expect(fixMojibake(broken)).toBe('Καλημέρα 🙂');
    expect(fixMojibake('café')).toBe('café');
    expect(fixMojibake('Καλημέρα')).toBe('Καλημέρα');
  });

  it('parses message_1.json oldest first in Athens time', () => {
    const m = (text: string) => Buffer.from(text, 'utf8').toString('latin1');
    const json = JSON.stringify({ participants: [{ name: m('Μαρία') }, { name: m('Αλέξανδρος') }], title: m('Μαρία'), thread_path: 'inbox/maria_1', messages: [
      { sender_name: m('Αλέξανδρος'), timestamp_ms: Date.UTC(2026, 10, 16, 8, 1), content: m('ναι!') },
      { sender_name: m('Μαρία'), timestamp_ms: Date.UTC(2026, 10, 16, 8, 0), content: m('καφέ;') },
    ] });
    const input = file('your_instagram_activity/messages/inbox/maria_1/message_1.json', json);
    expect(detectParser(input)).toBe(instagramParser);
    const source = instagramParser.parse(input) as Awaited<ReturnType<typeof instagramParser.parse>>;
    expect(source.messages.map(message => [message.sender, message.text, message.sentAt])).toEqual([
      ['Μαρία', 'καφέ;', '2026-11-16T10:00:00'],
      ['Αλέξανδρος', 'ναι!', '2026-11-16T10:01:00'],
    ]);
  });
});

describe('Gmail mbox parser', () => {
  const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
  const mbox = [
    'From 1@xxx Mon Nov 16 10:00:00 +0000 2026',
    'X-Gmail-Labels: Inbox',
    'Message-ID: <a@x>',
    'Date: Mon, 16 Nov 2026 08:00:00 +0000',
    `From: =?UTF-8?B?${b64('Ελένη Αντωνίου')}?= <eleni@example.edu>`,
    'To: Alex <alex@example.com>',
    `Subject: =?UTF-8?B?${b64('Συνάντηση')}?=`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64('Καλημέρα,\n\nΜπορούμε να βρεθούμε;\n\nΕ.Α.'),
    '',
    'From 2@xxx Mon Nov 16 11:00:00 +0000 2026',
    'X-Gmail-Labels: Sent',
    'Message-ID: <b@x>',
    'In-Reply-To: <a@x>',
    'References: <a@x>',
    'Date: Mon, 16 Nov 2026 09:00:00 +0000',
    'From: Alex <alex@example.com>',
    `To: =?UTF-8?B?${b64('Ελένη Αντωνίου')}?= <eleni@example.edu>`,
    'Subject: Re: Meeting',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Καλησπέρα σας,=0A=0AΝαι, την Τετάρτη.=0A=0A-- =0AAlex=0A=0AΣτις Δευ, 16/11/2026 στις 10:00, =CE=95=CE=BB=CE=AD=CE=BD=CE=B7 <eleni@example.edu> =CE=AD=CE=B3=CF=81=CE=B1=CF=88=CE=B5:=0A> Μπορούμε να βρεθούμε;',
    '',
  ].join('\n');

  it('splits on postmarks and unescapes >From', () => {
    expect(splitMbox('From a\nSubject: x\n\n>From here\nFrom b\nSubject: y\n\nbody')).toHaveLength(2);
    expect(splitMbox('From a\nSubject: x\n\n>From here\n')[0]).toContain('\nFrom here');
  });

  it('strips quoted history and signatures in Greek and English', () => {
    expect(stripQuotedAndSignature('Ναι.\n\nΣτις Δευ, 16 Νοε 2026 στις 10:00, Ελένη <e@x> έγραψε:\n> παλιό')).toBe('Ναι.');
    expect(stripQuotedAndSignature('Yes.\n\nOn Mon, Nov 16, 2026 at 10:00 AM Eleni <e@x>\nwrote:\n> old')).toBe('Yes.');
    expect(stripQuotedAndSignature('Γεια.\n-- \nΑλέξανδρος\n+30 691 234 5678')).toBe('Γεια.');
  });

  it('decodes MIME, threads by References, and finds the account owner', async () => {
    const source = await mboxParser.parse(file('Takeout/Mail/All mail.mbox', mbox));
    expect(source.ownerHints).toEqual(['alex@example.com']);
    expect(source.messages.map(message => [message.sender, message.text])).toEqual([
      ['Ελένη Αντωνίου', 'Καλημέρα,\n\nΜπορούμε να βρεθούμε;\n\nΕ.Α.'],
      ['Alex', 'Καλησπέρα σας,\n\nΝαι, την Τετάρτη.'],
    ]);
    expect(new Set(source.messages.map(message => message.threadKey)).size).toBe(1);
    expect(source.messages[0].threadTitle).toBe('Συνάντηση');
  });
});

describe('archives', () => {
  it('finds exports inside nested zips and skips media', async () => {
    const inner = await zip([['_chat.txt', '[03/11/26 21:05:10] Γιώργος: ela re\n']]);
    const outer = await zip([['WhatsApp Chat - Γιώργος.zip', inner], ['photo.jpg', Buffer.from([1, 2, 3])]]);
    const { sources, unrecognised } = await parseUpload(file('export.zip', outer));
    expect(sources.map(source => source.platform)).toEqual(['whatsapp']);
    expect(sources[0].messages[0].threadTitle).toBe('Γιώργος');
    expect(unrecognised).toEqual(['export.zip/photo.jpg']);
  });

  it('rejects path traversal (zip-slip)', async () => {
    const archive = await zip([['xx/evil.txt', 'boom']], false);
    const patched = Buffer.from(archive.toString('binary').replaceAll('xx/evil.txt', '../evil.txt'), 'binary');
    await expect(extractZip(patched)).rejects.toBeInstanceOf(UnsafeArchiveError);
  });

  it('rejects zip bombs by compression ratio', async () => {
    const bomb = await zip([['chat.txt', Buffer.alloc(4 * 1024 * 1024, 0x61)]]);
    await expect(extractZip(bomb)).rejects.toThrow(/zip bomb/);
  });
});

describe('redaction', () => {
  it('removes contact details, identifiers and other people\'s names in any Greek form', () => {
    const names = [{ name: 'Μαρία Γεωργίου', pseudonym: 'Person_A' }, { name: 'Μαρία', pseudonym: 'Person_A' }, { name: 'Νίκος', pseudonym: 'Person_B' }];
    const { text, counts } = redact('Η ΜΑΡΙΑ και ο Νίκο, της Μαρίας: 6912345678, +30 210 1234567, nikos@example.com, GR16 0110 1250 0000 0001 2300 695, ΑΦΜ 123456789, ΑΜΚΑ 01019912345, 4111 1111 1111 1111, https://x.gr/a?token=abc', { names });
    expect(text).toBe('Η Person_A και ο Person_B, της Person_A: [PHONE], [PHONE], [EMAIL], [IBAN], ΑΦΜ [AFM], ΑΜΚΑ [AMKA], [CARD], [URL]');
    expect(counts.name).toBe(3);
  });

  it('keeps times, dates, plain links and similar names intact', () => {
    expect(redact('στις 10:30, 2026-11-16, https://ntua.gr και η Μαριάννα', { names: [{ name: 'Μαρία', pseudonym: 'Person_A' }] }).text).toBe('στις 10:30, 2026-11-16, https://ntua.gr και η Μαριάννα');
  });

  it('assigns stable pseudonyms', () => {
    expect([0, 1, 25, 26].map(pseudonymFor)).toEqual(['Person_A', 'Person_B', 'Person_Z', 'Person_AA']);
  });
});

describe('language detection', () => {
  it('tells Greek, English, Greeklish and mixed apart', () => {
    expect(detectLang('πάμε για καφέ;')).toBe('el');
    expect(detectLang('see you tomorrow at the lab')).toBe('en');
    expect(detectLang('ela re pame gia kafe avrio?')).toBe('greeklish');
    expect(detectLang('ανέβασα το link στο repo, check it')).toBe('mixed');
  });
});

describe('ingest', () => {
  const chat = (other: string, lines: string[]) => lines.map((line, index) => `16/11/26, ${10 + index}:00 - ${line.startsWith('ME:') ? 'Αλέξανδρος' : other}: ${line.replace(/^ME:\s*/, '')}`).join('\n');

  it('is idempotent and adds only new messages from a newer export of the same chat', async () => {
    const db = openDatabase();
    const first = await importUpload(db, file('WhatsApp Chat with Μαρία.txt', chat('Μαρία', ['καφέ;', 'ME: ναι!'])));
    expect(first.sources[0].stats.added).toBe(2);
    const again = await importUpload(db, file('WhatsApp Chat with Μαρία.txt', chat('Μαρία', ['καφέ;', 'ME: ναι!', 'τέλεια'])));
    expect(again.sources[0].stats).toMatchObject({ added: 1, duplicates: 2, messages: 3 });
  });

  it('does not guess the owner from a single one-to-one chat, and links replies once confirmed', async () => {
    const db = openDatabase();
    await importUpload(db, file('WhatsApp Chat with Μαρία.txt', chat('Μαρία', ['καφέ;', 'ME: ναι, με τη Μαρία μαζί!'])));
    expect(ownerState(db).participants).toEqual([]);
    const me = ownerState(db).candidates.find(candidate => candidate.name === 'Αλέξανδρος')!;
    setOwner(db, [me.id]);
    const reply = db.prepare('SELECT reply_to_message_id, text_redacted FROM messages WHERE is_owner = 1').get() as { reply_to_message_id: string; text_redacted: string };
    expect(reply.reply_to_message_id).toBeTruthy();
    // Other people's names never reach the model in clear text.
    expect(reply.text_redacted).toBe('ναι, με τη Person_A μαζί!');
  });

  it('identifies the owner across chats', async () => {
    const db = openDatabase();
    await importUpload(db, file('WhatsApp Chat with Μαρία.txt', chat('Μαρία', ['καφέ;', 'ME: ναι!'])));
    await importUpload(db, file('WhatsApp Chat with Νίκος.txt', chat('Νίκος', ['εργασία;', 'ME: αύριο'])));
    expect(ownerState(db).participants.map(person => person.name)).toEqual(['Αλέξανδρος']);
  });
});
