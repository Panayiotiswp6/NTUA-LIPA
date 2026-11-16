import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

/** Shared page states: every twin page has loading, empty and error variants. */
export function Loading({ label = 'Φόρτωση…' }: { label?: string }) {
  return <div className="tw-state" role="status"><Loader2 className="tw-spin" size={20}/><span>{label}</span></div>;
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div className="tw-state tw-error" role="alert"><AlertTriangle size={20}/><span>{error}</span>{onRetry && <button className="tw-button" onClick={onRetry}>Δοκίμασε ξανά</button>}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="tw-empty"><strong>{title}</strong>{children}</div>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <header className="tw-page-header"><span className="tw-eyebrow">{eyebrow}</span><h1>{title}</h1>{children && <p>{children}</p>}</header>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  return <span className={`tw-badge ${tone}`}>{children}</span>;
}

/** Horizontal share bar, e.g. language mix. */
export function ShareBar({ parts }: { parts: Array<{ label: string; value: number; tone: string }> }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;
  return <div className="tw-sharebar">
    <div className="tw-sharebar-track" role="img" aria-label={parts.map(part => `${part.label} ${Math.round((part.value / total) * 100)}%`).join(', ')}>
      {parts.filter(part => part.value).map(part => <span key={part.label} className={part.tone} style={{ width: `${(part.value / total) * 100}%` }}/>)}
    </div>
    <div className="tw-sharebar-legend">{parts.filter(part => part.value).map(part => <span key={part.label}><i className={part.tone}/>{part.label} {Math.round((part.value / total) * 100)}%</span>)}</div>
  </div>;
}
