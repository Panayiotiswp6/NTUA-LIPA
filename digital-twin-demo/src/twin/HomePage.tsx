import { useEffect, useState } from 'react';
import { ArrowRight, Database, FlaskConical, MessagesSquare, ShieldCheck, UserRound } from 'lucide-react';
import { useAiStatus } from '../ai/provider';
import { api, type Overview } from './api';
import { ErrorState, Loading } from './ui';

const OUTCOMES = [
  { page: 'import', icon: Database, title: 'Λειτουργικό πρωτότυπο', text: 'Εισάγει το ψηφιακό σου αποτύπωμα (WhatsApp, Telegram, Gmail, Instagram, σημειώσεις) και χτίζει τον δίδυμο από αυτό.' },
  { page: 'persona', icon: UserRound, title: 'Persona model', text: 'Ένα προφίλ που ελέγχεις: γνώσεις, ύφος γραφής ανά περίσταση, προτιμήσεις και τρόπος απόφασης, με αποδείξεις.' },
  { page: 'studio', icon: MessagesSquare, title: 'Live demo', text: 'Από τα δεδομένα σε απαντήσεις και αποφάσεις που ακούγονται σαν εσένα, δίπλα σε ένα γενικό AI για σύγκριση.' },
  { page: 'fidelity', icon: FlaskConical, title: 'Προσέγγιση & πιστότητα', text: 'Πώς μαθαίνει, πώς μετράμε ότι είναι «εσύ» (blind test, hold-out), και πώς προστατεύεται η ιδιωτικότητα.' },
];

export default function HomePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const ai = useAiStatus();
  const load = () => { setError(''); api<Overview>('overview').then(setOverview, failure => setError((failure as Error).message)); };
  useEffect(load, []);
  const owner = overview?.owner.participants[0]?.name;
  return <div className="tw-page">
    <header className="tw-hero">
      <span className="tw-eyebrow">AI: YOUR DIGITAL SELF</span>
      <h1>Ένας ψηφιακός δίδυμος που μαθαίνει από τα δικά σου μηνύματα πώς γράφεις, τι ξέρεις και πώς αποφασίζεις — και προτείνει, ποτέ δεν στέλνει.</h1>
      <p>{ai.state === 'online' ? `Live λειτουργία με ${ai.model}.` : 'Offline demo mode: όλα λειτουργούν με τον δικό μας κώδικα ανάλυσης και κανόνες. Πρόσθεσε key και AI_ENABLED=true στο .env για live παραγωγή.'}</p>
    </header>
    {error && <ErrorState error={error} onRetry={load}/>}
    {!overview && !error && <Loading/>}
    {overview && <section className="tw-stats">
      <div><strong>{owner ?? '—'}</strong><span>ιδιοκτήτης του δίδυμου{overview.owner.confirmed ? '' : ' (προς επιβεβαίωση)'}</span></div>
      <div><strong>{overview.counts.messages.toLocaleString('el')}</strong><span>μηνύματα από {overview.sources.length} πηγές</span></div>
      <div><strong>{overview.counts.ownerMessages.toLocaleString('el')}</strong><span>δικά σου μηνύματα για ύφος</span></div>
      <div><strong>{overview.counts.pairs.toLocaleString('el')}</strong><span>ζεύγη ερώτησης → απάντησης</span></div>
    </section>}
    {overview && !overview.counts.messages && <div className="tw-callout"><strong>Ξεκίνα από την εισαγωγή.</strong> Ανέβασε μια εξαγωγή ή φόρτωσε το demo persona.<button className="tw-button primary" onClick={() => onNavigate('import')}>Εισαγωγή δεδομένων <ArrowRight size={15}/></button></div>}
    <section className="tw-outcomes">{OUTCOMES.map(item => <button key={item.page} className="tw-outcome" onClick={() => onNavigate(item.page)}>
      <item.icon size={22}/><strong>{item.title}</strong><span>{item.text}</span><em>Άνοιγμα <ArrowRight size={13}/></em>
    </button>)}</section>
    <button className="tw-link" onClick={() => onNavigate('privacy')}><ShieldCheck size={15}/>Πώς προστατεύονται τα δεδομένα σου</button>
  </div>;
}
