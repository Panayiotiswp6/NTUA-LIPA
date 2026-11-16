import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { BarChart3, Database, Home, UserRound } from 'lucide-react';
import { useAiStatus } from '../ai/provider';
import HomePage from './HomePage';
import ImportPage from './ImportPage';
import { Loading } from './ui';
import './twin.css';

export type TwinPage = 'home' | 'import' | 'persona' | 'studio' | 'ask' | 'fidelity' | 'privacy';

interface PageProps { onNavigate: (page: string) => void }
const PersonaPage = lazy(() => import('./PersonaPage'));

const PAGES: Array<{ id: TwinPage; label: string; icon: typeof Home; component: ComponentType<PageProps> }> = [
  { id: 'home', label: 'Επισκόπηση', icon: Home, component: HomePage },
  { id: 'import', label: 'Import', icon: Database, component: ImportPage },
  { id: 'persona', label: 'Persona', icon: UserRound, component: PersonaPage },
];

export default function TwinWorkspace({ initialPage = 'home' }: { initialPage?: TwinPage }) {
  const [page, setPage] = useState<TwinPage>(initialPage);
  const ai = useAiStatus();
  useEffect(() => { setPage(initialPage); }, [initialPage]);
  const Current = PAGES.find(item => item.id === page)!.component;
  const navigate = (next: string) => { if (PAGES.some(item => item.id === next)) setPage(next as TwinPage); };
  return <div className="tw-root">
    <nav className="tw-sidebar" aria-label="Digital Twin">
      {PAGES.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><item.icon size={17}/><span>{item.label}</span></button>)}
      <div className={`tw-mode ${ai.state}`}><BarChart3 size={14}/><span>{ai.state === 'online' ? `Live · ${ai.model}` : ai.paused ? 'AI σε παύση · offline' : 'Offline demo mode'}</span></div>
    </nav>
    <section className="tw-main">
      <Suspense fallback={<Loading/>}><Current onNavigate={navigate}/></Suspense>
    </section>
  </div>;
}
