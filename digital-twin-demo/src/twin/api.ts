/** Typed client for the twin API. Paths are relative so the app works under any base path. */

export type Lang = 'el' | 'en' | 'greeklish' | 'mixed' | 'none';
export interface SourceStats {
  messages: number; added: number; duplicates: number; documents: number; threads: number;
  from?: string; to?: string; ownerShare: number; languages: Partial<Record<Lang, number>>;
}
export interface Source { id: string; kind: string; filename: string; imported_at: string; included: boolean; stats: SourceStats }
export interface OwnerState {
  confirmed: boolean;
  participants: Array<{ id: string; name: string }>;
  candidates: Array<{ id: string; name: string; threads: number; messages: number }>;
}
export interface Counts { messages: number; ownerMessages: number; pairs: number; holdout: number; threads: number; documents: number; facts: number }
export interface Overview { owner: OwnerState; sources: Source[]; counts: Counts }
export interface ImportStage { stage: string; label: string; count: number; ms: number }
export interface ImportReport {
  sources: Array<{ id: string; kind: string; platform: string; filename: string; stats: SourceStats; warnings: string[] }>;
  unrecognised: string[];
  stages: ImportStage[];
  owner: OwnerState;
}
export interface Thread { id: string; platform: string; title: string; relationship: string; relationshipSource: string; messages: number; ownerMessages: number }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`api/twin/${path}`, init);
  } catch {
    throw new ApiError('Δεν υπάρχει σύνδεση με τον server. Η λειτουργία αυτή χρειάζεται το Docker (docker compose up).', 0);
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? (response.status === 404 ? 'Η λειτουργία χρειάζεται τον server του Digital Twin (docker compose up).' : `Σφάλμα ${response.status}`), response.status);
  return body;
}

export const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const uploadFile = (file: File) => api<ImportReport>('import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
  body: file,
});

export const PLATFORM_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', telegram: 'Telegram', gmail: 'Gmail', gmail_mbox: 'Gmail', instagram: 'Instagram', messenger: 'Messenger', document: 'Σημειώσεις', notes: 'Σημειώσεις',
};
export const LANG_LABEL: Record<Lang, string> = { el: 'Ελληνικά', en: 'English', greeklish: 'Greeklish', mixed: 'Μικτά', none: 'Χωρίς κείμενο' };
export const RELATIONSHIP_LABEL: Record<string, string> = { friend: 'Φίλος/η', family: 'Οικογένεια', study: 'Σπουδές', work: 'Επίσημο / εργασία', unknown: 'Άγνωστο' };

export const formatDate = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
