import { createHash } from 'node:crypto';
import type { Lang } from './types';

/** Lower-case and strip accents so «Καφέ», «ΚΑΦΕ» and «καφε» compare equal. */
export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el').replace(/ς/g, 'σ');

export const hash = (...parts: string[]) => createHash('sha256').update(parts.join('␟')).digest('hex');

export const words = (text: string) => fold(text).match(/[\p{L}\p{N}']+/gu) ?? [];

const GREEK = /\p{Script=Greek}/gu;
const LATIN = /[a-zA-Z]/g;

/** Common Greek words as typed in Latin letters. Matching whole words keeps English false positives low. */
const GREEKLISH = new Set([
  'kai', 'einai', 'eimai', 'ti', 'kaneis', 'kanis', 're', 'ela', 'mou', 'sou', 'na', 'den', 'tha', '8a', 'pame', 'pamε', 'xaxa', 'xaxaxa', 'nai',
  'oxi', 'kala', 'mia', 'ena', 'gia', 'apo', 'me', 'sto', 'sti', 'stin', 'ton', 'tin', 'tou', 'tis', 'ta', 'auto', 'afto', 'pou', 'pws', 'pos',
  'giati', 'twra', 'tora', 'aurio', 'avrio', 'simera', 'shmera', 'mporw', 'mporo', 'thelw', 'thelo', 'exw', 'exo', 'ok', 'telika', 'ksero',
  'kserw', 'oti', 'kati', 'tipota', 'poli', 'polu', 'kalimera', 'kalinixta', 'filaki', 'fili', 'efxaristw', 'eyxaristw', 'mpravo', 'vre',
  'kafe', 'kafes', 'meta', 'prin', 'mazi', 'ligo', 'mallon', 'isws', 'isos', 'doume', 'dw', 'leme', 'les',
]);
const ENGLISH_ONLY = new Set(['the', 'and', 'is', 'are', 'you', 'what', 'this', 'that', 'with', 'for', 'have', 'will', 'can', 'just', 'thanks', 'please']);

/** Greek, English, Greeklish (Greek in Latin letters) or a mix. A local differentiator for Greek users. */
export function detectLang(text: string): Lang {
  const greek = text.match(GREEK)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (!greek && !latin) return 'none';
  if (greek && latin) {
    const share = greek / (greek + latin);
    if (share > 0.85) return 'el';
    if (share < 0.15) return latinKind(text);
    return 'mixed';
  }
  return greek ? 'el' : latinKind(text);
}

function latinKind(text: string): Lang {
  const tokens = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (!tokens.length) return 'en';
  const greeklish = tokens.filter(token => GREEKLISH.has(token)).length;
  const english = tokens.filter(token => ENGLISH_ONLY.has(token)).length;
  return greeklish >= Math.max(1, english) && greeklish / tokens.length >= 0.15 ? 'greeklish' : 'en';
}

const EMOJI = /\p{Extended_Pictographic}/gu;
export const emojis = (text: string) => text.match(EMOJI) ?? [];
