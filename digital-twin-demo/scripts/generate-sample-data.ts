/**
 * Reproducible synthetic digital footprint for one fictional person, in each platform's REAL export format.
 *
 *   npx tsx scripts/generate-sample-data.ts      → writes sample-data/
 *
 * Owner: Αλέξανδρος Νικολάου, 3rd-semester ECE student at NTUA (fictional). Everyone and everything here is invented.
 * The data deliberately carries consistent facts, preferences and decision habits that persona analysis should rediscover:
 *   - studies ECE at NTUA, takes Σήματα και Συστήματα and Πιθανότητες; writes Python and React
 *   - applies for a backend internship at «Άνεμος Τεχνολογίες»
 *   - gym Mon/Tue/Thu/Fri 20:00, guitar Tue/Thu 16:00; studies best in the morning
 *   - no coffee after 18:00; favourite café «Πλάτανος» in Pangrati; freddo espresso σκέτο
 *   - DECISION: last-minute weekday invitations → declines and proposes the weekend
 *   - DECISION: in group work, proposes splitting tasks and takes the coding part
 *   - DECISION: never commits to a meeting without a concrete day and time
 *   - with professors: replies the same day, formal plural, asks for clarification before committing
 * Registers: lowercase + emoji with Maria, Greeklish with Giorgos, warm Greek with his mother,
 * practical Greek in the study group, formal Greek in email.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yazl from 'yazl';

const OUT = path.resolve(import.meta.dirname, '..', 'sample-data');
const OWNER = 'Αλέξανδρος Νικολάου';
const OWNER_EMAIL = 'alex.nikolaou@example.com';
const FIXED_MTIME = new Date('2026-11-16T09:00:00Z');

// ---------- deterministic randomness ----------
let seed = 20261116;
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
const chance = (p: number) => random() < p;

// ---------- calendar helpers (local Athens wall-clock) ----------
const DAY_NAMES = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const ACC_DAY = ['την Κυριακή', 'τη Δευτέρα', 'την Τρίτη', 'την Τετάρτη', 'την Πέμπτη', 'την Παρασκευή', 'το Σάββατο'];
const GREEKLISH_DAY = ['kyriaki', 'deftera', 'triti', 'tetarti', 'pempti', 'paraskeui', 'savvato'];
interface Stamp { date: Date }
const START = new Date(Date.UTC(2026, 4, 18)); // 18 May 2026
const END = new Date(Date.UTC(2026, 10, 15)); // 15 Nov 2026
const days = Math.round((END.getTime() - START.getTime()) / 86_400_000);
const randomDay = () => new Date(START.getTime() + Math.floor(random() * days) * 86_400_000);
const at = (day: Date, hour: number, minute: number) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute));
const later = (time: Date, minMinutes: number, maxMinutes: number) => new Date(time.getTime() + (minMinutes + Math.floor(random() * (maxMinutes - minMinutes + 1))) * 60_000);
const weekday = (date: Date) => date.getUTCDay();
const isWeekend = (date: Date) => weekday(date) === 0 || weekday(date) === 6;

type Turn = [speaker: string, text: string];
interface Episode { start: Date; turns: Turn[] }
interface Message { sender: string; text: string; time: Date }

function play(episodes: Episode[]): Message[] {
  const messages: Message[] = [];
  for (const episode of episodes.sort((a, b) => a.start.getTime() - b.start.getTime())) {
    let time = episode.start;
    for (const [sender, text] of episode.turns) {
      messages.push({ sender, text, time });
      time = later(time, 1, 9);
    }
  }
  return messages;
}

// ---------- Maria: close friend, lowercase, emoji, «τέλεια!», «πες μου» ----------
const MARIA = 'Μαρία Γεωργίου';
const activities = [['καφέ', '☕'], ['σινεμά', '🎬'], ['βόλτα', '🚶'], ['φαγητό', '🍕']];
function mariaEpisodes(count: number): Episode[] {
  const episodes: Episode[] = [];
  for (let i = 0; i < count; i++) {
    const day = randomDay();
    const kind = pick(['invite', 'invite', 'invite', 'photos', 'checkin', 'coffee-evening', 'plan', 'study']);
    const [activity, emoji] = pick(activities);
    if (kind === 'invite') {
      // The SAME invitation; only the day decides the answer. Text alone cannot tell them apart.
      const invitation = pick([`πάμε για ${activity} σήμερα; ${emoji}`, `θες ${activity} σήμερα;`, `πάμε για ${activity} σήμερα το απόγευμα;`, `έλα για ${activity} σήμερα!`]);
      if (isWeekend(day)) {
        episodes.push({ start: at(day, 11 + Math.floor(random() * 4), Math.floor(random() * 50)), turns: [
          [MARIA, invitation],
          [OWNER, activity === 'καφέ' ? pick(['ναι! πάμε στον πλάτανο; 🙂', 'ναι! πλάτανο στις 12; 🙂']) : pick(['ναι! πες μου ώρα 🙂', 'τέλεια, πάμε! τι ώρα; 🙂', 'ναι!! πες μου πού 🙂'])],
          [MARIA, pick(['στις 12;', 'στις 5;', 'στις 1;'])],
          [OWNER, pick(['τέλεια, εκεί θα είμαι 🙂', 'οκ! τα λέμε 🙂'])],
        ] });
      } else {
        // Decision pattern: last-minute weekday invitation → decline, propose the weekend.
        const gym = [1, 2, 4, 5].includes(weekday(day));
        episodes.push({ start: at(day, 13 + Math.floor(random() * 4), Math.floor(random() * 50)), turns: [
          [MARIA, invitation],
          [OWNER, gym ? pick(['σήμερα δεν προλαβαίνω 😅 έχω γυμναστήριο στις 8. το σάββατο όμως είμαι ελεύθερος, πάμε τότε;', 'σήμερα δεν μπορώ, έχω γυμναστήριο 😅 σάββατο;']) : pick(['σήμερα δύσκολα, μου το λες τελευταία στιγμή 😅 πάμε το σαββατοκύριακο;', 'σήμερα δεν μπορώ 😅 το σαββατοκύριακο όμως είμαι ελεύθερος!'])],
          [MARIA, pick(['οκ σάββατο τότε!', 'καλά, κυριακή τότε 🙂', 'έγινε!'])],
          [OWNER, pick(['τέλεια! πες μου ώρα 🙂', 'τέλεια! τα λέμε τότε 🙂'])],
        ] });
      }
    } else if (kind === 'coffee-evening') {
      episodes.push({ start: at(day, 18, 30 + Math.floor(random() * 20)), turns: [
        [MARIA, 'έλα για ένα καφεδάκι τώρα; ☕'],
        [OWNER, 'καφέ μετά τις 6 δεν πίνω, μετά δεν κοιμάμαι 😅 για βόλτα όμως είμαι!'],
        [MARIA, 'χαχα το ξέχασα πάλι'],
      ] });
    } else if (kind === 'photos') {
      episodes.push({ start: at(day, 21, Math.floor(random() * 50)), turns: [
        [MARIA, pick(['ανέβασα τις φωτογραφίες από χθες!', 'σου έστειλα τις φωτό 📷', 'είδες τι ωραία βγήκε η φωτογραφία;'])],
        [OWNER, pick(['το είδα, ευχαριστώ 🙂 βγήκαν τέλεια!', 'τέλεια! ευχαριστώ 🙂', 'χαχα τέλεια βγήκε!'])],
      ] });
    } else if (kind === 'checkin') {
      episodes.push({ start: at(day, 13, Math.floor(random() * 50)), turns: [
        [MARIA, pick(['τι κάνεις; χάθηκες', 'πώς πάει το διάβασμα;', 'όλα καλά;'])],
        [OWNER, pick(['όλα καλά! διάβασμα για σήματα 😅 εσύ;', 'καλά! πρωί διάβασμα, απόγευμα κιθάρα 🙂 εσύ;', 'εδώ, με πιθανότητες 😅 εσύ τι κάνεις;'])],
        [MARIA, pick(['κι εγώ τα ίδια', 'καλά καλά!', 'σε πιέζουν πολύ βλέπω χαχα'])],
      ] });
    } else if (kind === 'study') {
      episodes.push({ start: at(day, 20, 30), turns: [
        [MARIA, 'να διαβάσουμε μαζί απόψε;'],
        [OWNER, 'το βράδυ δεν αποδίδω καθόλου 😅 αύριο πρωί στη βιβλιοθήκη;'],
        [MARIA, 'οκ στις 10;'],
        [OWNER, 'τέλεια! 🙂'],
      ] });
    } else {
      episodes.push({ start: at(day, 16, Math.floor(random() * 50)), turns: [
        [MARIA, pick(['να κανονίσουμε κάτι αυτή τη βδομάδα;', 'να βρεθούμε αυτή τη βδομάδα;'])],
        [OWNER, 'ναι! πες μου ποια μέρα και ώρα σκέφτεσαι 🙂'],
        [MARIA, `${pick(ACC_DAY.slice(5))} ;`.replace(' ;', ';')],
        [OWNER, 'τέλεια, κλείσ’ το 🙂'],
      ] });
    }
  }
  return episodes;
}

// ---------- Giorgos: childhood friend, Greeklish ----------
const GIORGOS = 'Γιώργος Καραλής';
function giorgosEpisodes(count: number): Episode[] {
  const episodes: Episode[] = [];
  for (let i = 0; i < count; i++) {
    const day = randomDay();
    const kind = pick(['match', 'lastminute', 'lastminute', 'game', 'gym', 'joke']);
    if (kind === 'lastminute') {
      const invitation = pick(['ela re pame gia mpala twra?', 'pame gia mpasket twra?', 'ela gia mpira simera?']);
      episodes.push({ start: at(day, isWeekend(day) ? 12 : 19, Math.floor(random() * 40)), turns: isWeekend(day)
        ? [[GIORGOS, invitation], [OWNER, pick(['nai re, se 10 lepta ekei', 'ela, erxomai!', 'nai re pame'])]]
        : [[GIORGOS, invitation], [OWNER, pick(['twra den mporw re, exw gym. savvato?', 'simera oxi re, exw diavasma. savvato?'])], [GIORGOS, 'ok re savvato']],
      });
    } else if (kind === 'match') {
      episodes.push({ start: at(day, 18, Math.floor(random() * 40)), turns: [
        [GIORGOS, 'eides to match xthes??'],
        [OWNER, pick(['nai re trelo matsaki xaxa', 'oxi re, diavaza. ti egine?'])],
        [GIORGOS, pick(['2-1 sto 90', 'xasame re', 'clean sheet!'])],
        [OWNER, pick(['xaxaxa ela', 'kala 8a to dw meta', 'ela re'])],
      ] });
    } else if (kind === 'game') {
      episodes.push({ start: at(day, 22, Math.floor(random() * 30)), turns: [
        [GIORGOS, 'online ena game?'],
        [OWNER, isWeekend(day) ? 'nai re mpainw se 10 lepta' : 'oxi re, avrio exw ma8hma prwi. savvatokyriako'],
      ] });
    } else if (kind === 'gym') {
      episodes.push({ start: at(day, 19, 10), turns: [
        [GIORGOS, `${GREEKLISH_DAY[weekday(day)]} gym?`],
        [OWNER, [1, 2, 4, 5].includes(weekday(day)) ? 'nai stis 8 ekei' : 'simera oxi re, 8a paw avrio'],
      ] });
    } else {
      episodes.push({ start: at(day, 15, Math.floor(random() * 50)), turns: [
        [GIORGOS, pick(['re des auto xaxaxa', 'ti les re', 'kaneis tipota?'])],
        [OWNER, pick(['xaxaxa', 'ela re, diavazw', 'tipota re, ola kala'])],
      ] });
    }
  }
  return episodes;
}

// ---------- Mother: warm Greek ----------
const MOM = 'Μαμά';
function momEpisodes(count: number): Episode[] {
  const episodes: Episode[] = [];
  for (let i = 0; i < count; i++) {
    const day = randomDay();
    const kind = pick(['food', 'sunday', 'exam', 'call']);
    const turns: Turn[] = kind === 'food'
      ? [[MOM, 'Έφαγες σήμερα;'], [OWNER, 'Ναι μαμά, έφαγα. Μην ανησυχείς ❤️'], [MOM, 'Φιλιά!'], [OWNER, 'Φιλιά!']]
      : kind === 'sunday'
        ? [[MOM, 'Θα έρθεις την Κυριακή για φαγητό;'], [OWNER, 'Ναι, θα έρθω το μεσημέρι. Φέρνω και γλυκό ❤️']]
        : kind === 'exam'
          ? [[MOM, 'Πώς πήγε το μάθημα;'], [OWNER, 'Καλά μαμά, ήταν δύσκολο αλλά τα πήγα καλά 🙂']]
          : [[MOM, 'Πάρε με όταν μπορείς.'], [OWNER, 'Θα σε πάρω το βράδυ μετά το γυμναστήριο ❤️']];
    episodes.push({ start: at(day, 12 + Math.floor(random() * 6), Math.floor(random() * 50)), turns });
  }
  return episodes;
}

// ---------- Telegram study group: practical Greek, takes the coding part ----------
const NIKOS = 'Νίκος Παπαδάκης';
const DIMITRA = 'Δήμητρα Σταύρου';
function studyEpisodes(count: number): Episode[] {
  const episodes: Episode[] = [];
  for (let i = 0; i < count; i++) {
    const day = randomDay();
    const kind = pick(['split', 'meeting', 'question', 'deadline', 'evening-meeting']);
    if (kind === 'split') {
      episodes.push({ start: at(day, 11, Math.floor(random() * 50)), turns: [
        [DIMITRA, 'Βγήκε η νέα άσκηση. Πώς τη μοιράζουμε;'],
        [OWNER, 'Προτείνω να τη μοιράσουμε ανά ερώτημα. Αναλαμβάνω τον κώδικα σε Python, εσείς τη θεωρία και την αναφορά;'],
        [NIKOS, 'Οκ, εγώ παίρνω τη θεωρία.'],
        [OWNER, 'Τέλεια. Ανεβάζω τον κώδικα στο κοινό repo μέχρι την Πέμπτη.'],
      ] });
    } else if (kind === 'meeting') {
      episodes.push({ start: at(day, 10, Math.floor(random() * 40)), turns: [
        [NIKOS, pick(['Να βρεθούμε να το δούμε μαζί;', 'Να βρεθούμε αυτή τη βδομάδα;'])],
        [OWNER, 'Ναι. Ποια μέρα και ώρα σας βολεύει; Εγώ προτιμώ πρωί.'],
        [DIMITRA, `${DAY_NAMES[pick([1, 3, 5])]} 10:00;`],
        [OWNER, 'Οκ, κλείνουμε. Θα κλείσω αίθουσα στη βιβλιοθήκη.'],
      ] });
    } else if (kind === 'evening-meeting') {
      episodes.push({ start: at(day, 17, Math.floor(random() * 40)), turns: [
        [NIKOS, 'Μπορείτε σήμερα στις 9 το βράδυ online;'],
        [OWNER, 'Σήμερα το βράδυ δεν μπορώ. Αύριο το πρωί;'],
        [NIKOS, 'Οκ, αύριο 10.'],
      ] });
    } else if (kind === 'question') {
      episodes.push({ start: at(day, 14, Math.floor(random() * 50)), turns: [
        [NIKOS, pick(['Έχω κολλήσει στο δεύτερο ερώτημα.', 'Δεν καταλαβαίνω τι ζητάει το 3.', 'Η συνέλιξη στο 2β μου βγαίνει λάθος.'])],
        [OWNER, pick(['Ποιο σημείο ακριβώς; Στείλε μου τι έχεις γράψει.', 'Στείλε μου τον κώδικα να το δω.', 'Για ποιο κομμάτι λες; Τη θεωρία ή τον κώδικα;'])],
      ] });
    } else {
      episodes.push({ start: at(day, 21, Math.floor(random() * 30)), turns: [
        [DIMITRA, 'Θυμίζω ότι η προθεσμία είναι την Παρασκευή.'],
        [OWNER, 'Ο κώδικας είναι έτοιμος, μένει μόνο η αναφορά.'],
      ] });
    }
  }
  return episodes;
}

// ---------- Instagram: Maria + Katerina (exported with Meta's mojibake) ----------
const KATERINA = 'Κατερίνα Δημητρίου';
function instagramEpisodes(friend: string, count: number): Episode[] {
  const episodes: Episode[] = [];
  for (let i = 0; i < count; i++) {
    const day = randomDay();
    const kind = pick(['story', 'invite', 'reel']);
    const turns: Turn[] = kind === 'story'
      ? [[friend, pick(['τέλειο το story σου!', 'πού είναι αυτό;'])], [OWNER, pick(['χαχα ευχαριστώ 🙂', 'στον πλάτανο στο παγκράτι! 🙂'])]]
      : kind === 'invite'
        ? isWeekend(day)
          ? [[friend, 'πάμε για καφέ αύριο;'], [OWNER, 'ναι! στον πλάτανο το πρωί; 🙂']]
          : [[friend, 'έλα απόψε στο πάρτι!'], [OWNER, 'απόψε δεν μπορώ 😅 έχω μάθημα αύριο πρωί. το σάββατο όμως!']]
        : [[friend, 'δες αυτό το reel χαχα'], [OWNER, 'χαχαχα τέλειο 😂']];
    episodes.push({ start: at(day, 19 + Math.floor(random() * 3), Math.floor(random() * 50)), turns });
  }
  return episodes;
}

// ---------- formats ----------
const pad = (value: number) => String(value).padStart(2, '0');

/** Android, Greek locale, 12-hour clock: "16/11/26, 10:15 π.μ. - Μαρία: …" */
function whatsappAndroid(messages: Message[], twelveHour: boolean) {
  const lines = ['16/5/26, 9:00 π.μ. - Τα μηνύματα και οι κλήσεις είναι κρυπτογραφημένα από άκρο σε άκρο. Πατήστε για να μάθετε περισσότερα.'];
  for (const message of messages) {
    const t = message.time;
    const date = `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${String(t.getUTCFullYear()).slice(2)}`;
    const hour = t.getUTCHours();
    const clock = twelveHour ? `${hour % 12 || 12}:${pad(t.getUTCMinutes())} ${hour < 12 ? 'π.μ.' : 'μ.μ.'}` : `${pad(hour)}:${pad(t.getUTCMinutes())}`;
    lines.push(`${date}, ${clock} - ${message.sender}: ${message.text}`);
    if (chance(0.03)) lines.push(`${date}, ${clock} - ${message.sender}: <Παραλείφθηκαν πολυμέσα>`);
  }
  return `${lines.join('\n')}\n`;
}

/** iOS: "[16/11/26 10:15:32] Γιώργος: …" with the invisible LRM marks iOS adds. */
function whatsappIos(messages: Message[]) {
  const lines = ['[16/5/26 09:00:00] Γιώργος Καραλής: ‎Τα μηνύματα και οι κλήσεις είναι κρυπτογραφημένα από άκρο σε άκρο.'];
  for (const message of messages) {
    const t = message.time;
    lines.push(`[${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${String(t.getUTCFullYear()).slice(2)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}] ${message.sender}: ${message.text}`);
  }
  return `${lines.join('\r\n')}\r\n`;
}

const iso = (time: Date) => `${time.getUTCFullYear()}-${pad(time.getUTCMonth() + 1)}-${pad(time.getUTCDate())}T${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())}:${pad(time.getUTCSeconds())}`;
/** Athens is UTC+3 in summer, UTC+2 from 25 Oct 2026. Exports that carry epoch times need real UTC. */
const athensToUtcMs = (time: Date) => time.getTime() - (time < new Date(Date.UTC(2026, 9, 25, 1)) ? 3 : 2) * 3_600_000;

/** Meta writes UTF-8 bytes as Latin-1 code points inside JSON. Reproduce that faithfully. */
const mojibake = (text: string) => Buffer.from(text, 'utf8').toString('latin1');

function metaThread(friend: string, folder: string, messages: Message[]) {
  return JSON.stringify({
    participants: [{ name: mojibake(friend) }, { name: mojibake(OWNER) }],
    messages: [...messages].reverse().map(message => ({ sender_name: mojibake(message.sender), timestamp_ms: athensToUtcMs(message.time), content: mojibake(message.text), is_geoblocked_for_viewer: false })),
    title: mojibake(friend),
    is_still_participant: true,
    thread_path: `inbox/${folder}`,
    magic_words: [],
  }, null, 2);
}

function telegramExport(groups: Array<{ id: number; name: string; type: string; messages: Message[] }>) {
  let id = 1000;
  const fromId = (sender: string) => (sender === OWNER ? 'user700100' : sender === NIKOS ? 'user700200' : 'user700300');
  return JSON.stringify({
    about: 'Here is the data you requested.',
    personal_information: { user_id: 700100, first_name: 'Αλέξανδρος', last_name: 'Νικολάου', username: 'alex_nikolaou_demo' },
    chats: {
      about: 'This page lists all chats from this export.',
      list: groups.map(group => ({
        name: group.name, type: group.type, id: group.id,
        messages: [
          { id: id++, type: 'service', date: '2026-05-18T09:00:00', actor: OWNER, action: 'create_group', title: group.name },
          ...group.messages.map(message => ({
            id: id++, type: 'message', date: iso(message.time), from: message.sender, from_id: fromId(message.sender),
            // Telegram stores formatting as entity arrays; mix both shapes like real exports.
            text: chance(0.2) ? [message.text.split(' ')[0] + ' ', { type: 'bold', text: message.text.split(' ').slice(1).join(' ') }] : message.text,
          })),
        ],
      })),
    },
  }, null, 1);
}

// ---------- email (formal register) ----------
interface Mail { from: [string, string]; to: [string, string]; subject: string; date: Date; body: string; id: string; inReplyTo?: string; references?: string[]; labels: string }
const ELENI: [string, string] = ['Ελένη Αντωνίου', 'eleni.antoniou@example.edu'];
const HR: [string, string] = ['Δέσποινα Ραφαηλίδου', 'careers@anemos-tech.example.com'];
const SECRETARY: [string, string] = ['Γραμματεία ΣΗΜΜΥ', 'secretary@ece.example.edu'];
const ME: [string, string] = [OWNER, OWNER_EMAIL];
const SIGNATURE = '\n\n-- \nΑλέξανδρος Νικολάου\nΦοιτητής ΗΜΜΥ, ΕΜΠ\n+30 691 234 5678';

function emailThreads(): Mail[][] {
  const threads: Array<Array<Omit<Mail, 'id' | 'inReplyTo' | 'references' | 'labels'>>> = [
    [
      { from: ELENI, to: ME, subject: 'Συνάντηση για την εργασία', date: at(new Date(Date.UTC(2026, 9, 6)), 10, 12), body: 'Καλημέρα Αλέξανδρε,\n\nΘα μπορούσαμε να συναντηθούμε για να συζητήσουμε την πρόοδο της εργασίας σας;\n\nΜε εκτίμηση,\nΕλένη Αντωνίου' },
      { from: ME, to: ELENI, subject: 'Re: Συνάντηση για την εργασία', date: at(new Date(Date.UTC(2026, 9, 6)), 13, 40), body: 'Καλησπέρα σας,\n\nΣας ευχαριστώ για το μήνυμά σας. Θα μπορούσατε να μου προτείνετε μια συγκεκριμένη ημέρα και ώρα; Τα πρωινά είμαι συνήθως διαθέσιμος.\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου' },
      { from: ELENI, to: ME, subject: 'Re: Συνάντηση για την εργασία', date: at(new Date(Date.UTC(2026, 9, 7)), 9, 5), body: 'Την Τετάρτη στις 11:00 στο γραφείο μου.\n\nΕ.Α.' },
      { from: ME, to: ELENI, subject: 'Re: Συνάντηση για την εργασία', date: at(new Date(Date.UTC(2026, 9, 7)), 11, 20), body: 'Καλημέρα σας,\n\nΒεβαίως, θα είμαι εκεί την Τετάρτη στις 11:00. Σας ευχαριστώ.\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου' },
    ],
    [
      { from: ELENI, to: ME, subject: 'Διευκρινίσεις για το τελευταίο ερώτημα', date: at(new Date(Date.UTC(2026, 9, 20)), 16, 0), body: 'Καλησπέρα,\n\nΣε ποιο σημείο της εκφώνησης έχετε απορία;\n\nΕλένη Αντωνίου' },
      { from: ME, to: ELENI, subject: 'Re: Διευκρινίσεις για το τελευταίο ερώτημα', date: at(new Date(Date.UTC(2026, 9, 20)), 18, 15), body: 'Καλησπέρα σας,\n\nΗ απορία μου αφορά το ερώτημα 3β: δεν είναι σαφές αν το σήμα εισόδου θεωρείται αιτιατό. Θα μπορούσατε να το διευκρινίσετε;\n\nΣας ευχαριστώ εκ των προτέρων.\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου' },
    ],
    [
      { from: HR, to: ME, subject: 'Πρακτική άσκηση backend – συνέντευξη', date: at(new Date(Date.UTC(2026, 8, 15)), 12, 30), body: 'Αγαπητέ κύριε Νικολάου,\n\nΣας ευχαριστούμε για την αίτησή σας για τη θέση πρακτικής άσκησης backend στην Άνεμος Τεχνολογίες. Θα θέλατε να κανονίσουμε μια σύντομη συνέντευξη;\n\nΜε εκτίμηση,\nΔέσποινα Ραφαηλίδου\nΆνεμος Τεχνολογίες' },
      { from: ME, to: HR, subject: 'Re: Πρακτική άσκηση backend – συνέντευξη', date: at(new Date(Date.UTC(2026, 8, 15)), 15, 10), body: 'Καλησπέρα σας,\n\nΣας ευχαριστώ πολύ για την πρόσκληση. Θα ήθελα πολύ να κανονίσουμε συνέντευξη. Είμαι διαθέσιμος τα πρωινά, εκτός Δευτέρας και Τετάρτης έως τις 10:30 λόγω μαθημάτων.\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου' },
      { from: HR, to: ME, subject: 'Re: Πρακτική άσκηση backend – συνέντευξη', date: at(new Date(Date.UTC(2026, 8, 16)), 10, 0), body: 'Τέλεια, σας στέλνουμε πρόσκληση για την Πέμπτη στις 11:00 (online).\n\nΔ.Ρ.' },
      { from: ME, to: HR, subject: 'Re: Πρακτική άσκηση backend – συνέντευξη', date: at(new Date(Date.UTC(2026, 8, 16)), 10, 45), body: 'Καλημέρα σας,\n\nΕπιβεβαιώνω την Πέμπτη στις 11:00. Ανυπομονώ να μιλήσουμε για τη θέση και για την εμπειρία μου με Python και React.\n\nΜε εκτίμηση,\nΑλέξανδρος Νικολάου' },
    ],
    [
      { from: SECRETARY, to: ME, subject: 'Δήλωση μαθημάτων χειμερινού εξαμήνου', date: at(new Date(Date.UTC(2026, 9, 1)), 9, 0), body: 'Αγαπητοί φοιτητές,\n\nΥπενθυμίζεται ότι η δήλωση μαθημάτων λήγει στις 10 Οκτωβρίου.\n\nΓραμματεία' },
      { from: ME, to: SECRETARY, subject: 'Re: Δήλωση μαθημάτων χειμερινού εξαμήνου', date: at(new Date(Date.UTC(2026, 9, 1)), 12, 30), body: 'Καλημέρα σας,\n\nΘα ήθελα να ρωτήσω αν μπορώ να δηλώσω το μάθημα επιλογής της Δευτέρας μετά την προθεσμία, καθώς δεν έχω αποφασίσει ακόμη ανάμεσα στην Πολιτική Οικονομία και στην Οργάνωση και Διοίκηση.\n\nΕυχαριστώ πολύ,\nΑλέξανδρος Νικολάου' },
    ],
    [
      { from: ['Νίκος Παπαδάκης', 'nikos.papadakis@example.com'], to: ME, subject: 'Απορία για την ομαδική εργασία', date: at(new Date(Date.UTC(2026, 10, 3)), 19, 0), body: 'Γεια σου Αλέξανδρε,\n\nΠοιο κομμάτι της εργασίας αναλαμβάνεις τελικά;\n\nΝίκος' },
      { from: ME, to: ['Νίκος Παπαδάκης', 'nikos.papadakis@example.com'], subject: 'Re: Απορία για την ομαδική εργασία', date: at(new Date(Date.UTC(2026, 10, 3)), 20, 5), body: 'Γεια σου Νίκο,\n\nΑναλαμβάνω τον κώδικα, όπως πάντα. Εσύ αν μπορείς πάρε τη θεωρία και την αναφορά.\n\nΑλέξανδρος' },
    ],
  ];
  return threads.map((thread, threadIndex) => {
    const ids = thread.map((_, index) => `<t${threadIndex}m${index}.${index}@mail.example.com>`);
    return thread.map((mail, index) => ({
      ...mail,
      id: ids[index],
      inReplyTo: index ? ids[index - 1] : undefined,
      references: ids.slice(0, index),
      labels: mail.from[1] === OWNER_EMAIL ? 'Sent,Opened' : 'Inbox,Opened,Category Personal',
    }));
  });
}

/** Encode a header with non-ASCII text the way real mail clients do (RFC 2047). */
const encodeWord = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`);
const rfc2822 = (time: Date) => new Date(athensToUtcMs(time)).toUTCString().replace('GMT', '+0000');

/** RFC 2045 quoted-printable with soft line breaks, as Gmail emits for non-ASCII text. */
function quotedPrintableEncode(text: string) {
  return text.split('\n').map(line => {
    const encoded = Buffer.from(line, 'utf8').toString('binary').replace(/[^\x20-\x7e]|=/g, char => `=${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
    const parts: string[] = [];
    let rest = encoded;
    while (rest.length > 75) {
      let cut = 75;
      const escape = rest.lastIndexOf('=', cut);
      if (escape > cut - 3) cut = escape;
      parts.push(`${rest.slice(0, cut)}=`);
      rest = rest.slice(cut);
    }
    parts.push(rest);
    return parts.join('\n');
  }).join('\n');
}

function quotedHistory(previous: Mail | undefined) {
  if (!previous) return '';
  const when = `${DAY_NAMES[weekday(previous.date)].slice(0, 3)}, ${previous.date.getUTCDate()}/${previous.date.getUTCMonth() + 1}/2026`;
  return `\n\nΣτις ${when} στις ${pad(previous.date.getUTCHours())}:${pad(previous.date.getUTCMinutes())}, ${previous.from[0]} <${previous.from[1]}> έγραψε:\n${previous.body.split('\n').map(line => `> ${line}`).join('\n')}`;
}

function mbox(threads: Mail[][]) {
  const chunks: string[] = [];
  for (const thread of threads) {
    thread.forEach((mail, index) => {
      const mine = mail.from[1] === OWNER_EMAIL;
      // Replies carry the quoted history (and the owner's signature), like Gmail does; the parser must strip both.
      const body = mail.body + (mine ? SIGNATURE : '') + quotedHistory(thread[index - 1]);
      const quotedPrintable = index % 2 === 1;
      const encoded = quotedPrintable
        ? quotedPrintableEncode(body)
        : Buffer.from(body, 'utf8').toString('base64').replace(/.{76}/g, '$&\n');
      chunks.push([
        `From 1700000000000000${chunks.length}@xxx ${rfc2822(mail.date)}`,
        `X-GM-THRID: ${1800000000000000 + threads.indexOf(thread)}`,
        `X-Gmail-Labels: ${mail.labels}`,
        `Message-ID: ${mail.id}`,
        ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.references!.join(' ')}`] : []),
        `Date: ${rfc2822(mail.date)}`,
        `From: ${encodeWord(mail.from[0])} <${mail.from[1]}>`,
        `To: ${encodeWord(mail.to[0])} <${mail.to[1]}>`,
        `Subject: ${encodeWord(mail.subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        `Content-Transfer-Encoding: ${quotedPrintable ? 'quoted-printable' : 'base64'}`,
        '',
        encoded,
        '',
      ].join('\n'));
    });
  }
  return chunks.join('\n');
}

// ---------- notes (knowledge, not style) ----------
const NOTES: Record<string, string> = {
  'Στόχοι εξαμήνου.md': `# Στόχοι εξαμήνου\n\n- Να περάσω Σήματα και Συστήματα και Πιθανότητες με 7+.\n- Διάβασμα **πρωί** (8:00–12:00) — το βράδυ δεν αποδίδω.\n- Γυμναστήριο Δευτέρα, Τρίτη, Πέμπτη, Παρασκευή 20:00.\n- Κιθάρα Τρίτη και Πέμπτη 16:00.\n- Καφές όχι μετά τις 18:00.\n- Να τελειώσω το side project σε React και FastAPI.\n`,
  'Πρακτική άσκηση.md': `# Πρακτική άσκηση\n\nΣτόχος: θέση **backend** για το καλοκαίρι.\n\n- Αίτηση: Άνεμος Τεχνολογίες (Python, PostgreSQL). Συνέντευξη: Πέμπτη 11:00, online.\n- Να φρεσκάρω SQL indexes και REST design.\n- Δεύτερη επιλογή: θέση data engineering.\n`,
  'Κανόνες ομαδικών εργασιών.md': `# Κανόνες ομαδικών εργασιών\n\n1. Μοιράζουμε ανά ερώτημα από την αρχή.\n2. Εγώ αναλαμβάνω τον κώδικα (Python), οι άλλοι θεωρία και αναφορά.\n3. Συναντήσεις μόνο με συγκεκριμένη μέρα και ώρα, κατά προτίμηση πρωί.\n4. Ο κώδικας ανεβαίνει στο κοινό repo δύο μέρες πριν την προθεσμία.\n`,
};

// ---------- write ----------
function zip(entries: Array<[string, string | Buffer]>): Promise<Buffer> {
  return new Promise(resolve => {
    const archive = new yazl.ZipFile();
    for (const [name, content] of entries) archive.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), name, { mtime: FIXED_MTIME });
    const chunks: Buffer[] = [];
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.end();
  });
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const maria = play(mariaEpisodes(70));
  const giorgos = play(giorgosEpisodes(40));
  const mom = play(momEpisodes(18));
  const study = play(studyEpisodes(30));
  const nikosPrivate = play(studyEpisodes(8).map(episode => ({ ...episode, turns: episode.turns.map(([speaker, text]) => [speaker === DIMITRA ? NIKOS : speaker, text] as Turn) })));
  const igMaria = play(instagramEpisodes(MARIA, 20));
  const igKaterina = play(instagramEpisodes(KATERINA, 16));
  const mail = emailThreads();

  writeFileSync(path.join(OUT, 'takeout-mail.zip'), await zip([['Takeout/Mail/All mail Including Spam and Trash.mbox', mbox(mail)], ['Takeout/archive_browser.html', '<html></html>']]));
  writeFileSync(path.join(OUT, 'WhatsApp Chat with Μαρία Γεωργίου.zip'), await zip([['WhatsApp Chat with Μαρία Γεωργίου.txt', whatsappAndroid(maria, true)], ['IMG-20261103-WA0002.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])]]));
  writeFileSync(path.join(OUT, 'WhatsApp Chat - Γιώργος Καραλής.zip'), await zip([['_chat.txt', whatsappIos(giorgos)]]));
  writeFileSync(path.join(OUT, 'WhatsApp Chat with Μαμά.txt'), whatsappAndroid(mom, false));
  writeFileSync(path.join(OUT, 'telegram-result.json'), telegramExport([
    { id: 4400001, name: 'ΣΗΜΜΥ · Ομάδα εργασίας Σήματα', type: 'private_group', messages: study },
    { id: 4400002, name: NIKOS, type: 'personal_chat', messages: nikosPrivate },
  ]));
  writeFileSync(path.join(OUT, 'instagram-export.zip'), await zip([
    ['your_instagram_activity/messages/inbox/mariageorgiou_1029384756/message_1.json', metaThread(MARIA, 'mariageorgiou_1029384756', igMaria)],
    ['your_instagram_activity/messages/inbox/katerinadimitriou_5647382910/message_1.json', metaThread(KATERINA, 'katerinadimitriou_5647382910', igKaterina)],
    ['media/photo_123.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
  ]));
  writeFileSync(path.join(OUT, 'obsidian-notes.zip'), await zip(Object.entries(NOTES).map(([name, text]) => [`Obsidian Vault/${name}`, text])));

  const total = maria.length + giorgos.length + mom.length + study.length + nikosPrivate.length + igMaria.length + igKaterina.length + mail.flat().length;
  console.log(`sample-data written: ${total} messages, ${Object.keys(NOTES).length} notes → ${OUT}`);
}

await main();
