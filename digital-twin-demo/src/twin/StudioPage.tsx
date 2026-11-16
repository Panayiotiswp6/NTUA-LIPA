import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Columns2, Info, Loader2, Send, X } from 'lucide-react';
import { api, json, PLATFORM_LABEL, RELATIONSHIP_LABEL } from './api';
import { Badge, ErrorState, Loading, PageHeader } from './ui';

interface InboxMessage { id: string; from: string; platform: string; relationship: string; sentAt: string; text: string; note: string }
interface Exemplar { id: string; incoming: string; reply: string; platform: string; relationship: string; contact: string; score: number; coverage: number; sameSituation: boolean; source: string }
interface TwinReply {
  text: string; engine: 'twin-llm' | 'offline-twin' | 'abstain'; register: string; confidence: number; rationale: string; situations: string[];
  exemplars: Exemplar[]; facts: Array<{ id: string; category: string; statement: string; confidence: number }>;
  style: { score: number; notes: string[] }; availability?: { status: string; reason: string }; abstained: boolean; model?: string;
}

const ENGINE: Record<TwinReply['engine'], { label: string; tone: 'accent' | 'neutral' | 'warn' }> = {
  'twin-llm': { label: 'Twin · LLM', tone: 'accent' },
  'offline-twin': { label: 'Twin · offline (τα δικά σου λόγια)', tone: 'neutral' },
  abstain: { label: 'Απέχει', tone: 'warn' },
};
const pct = (value: number) => `${Math.round(value * 100)}%`;
const time = (iso: string) => new Date(`${iso}Z`).toLocaleString('el-GR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export default function StudioPage() {
  const [inbox, setInbox] = useState<InboxMessage[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [reply, setReply] = useState<TwinReply | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState(false);
  const [generic, setGeneric] = useState<{ text?: string; error?: string; loading?: boolean }>({});
  const [saved, setSaved] = useState('');
  const [custom, setCustom] = useState({ from: '', platform: 'whatsapp', relationship: 'friend', text: '' });

  useEffect(() => {
    api<{ inbox: InboxMessage[]; aiAvailable: boolean }>('studio').then(result => { setInbox(result.inbox); setAiAvailable(result.aiAvailable); setSelected(result.inbox[0]); }, failure => setError((failure as Error).message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoading(true); setReply(null); setSaved(''); setGeneric({});
    api<TwinReply>('reply', json('POST', { incoming: selected.text, platform: selected.platform, relationship: selected.relationship, contactName: selected.from, sentAt: selected.sentAt }))
      .then(result => { if (active) { setReply(result); setDraft(result.text); } }, failure => active && setError((failure as Error).message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    if (!compare || !selected || generic.text || generic.error || generic.loading) return;
    setGeneric({ loading: true });
    api<{ text: string }>('generic', json('POST', { incoming: selected.text })).then(result => setGeneric({ text: result.text }), failure => setGeneric({ error: (failure as Error).message }));
  }, [compare, selected, generic]);

  async function feedback(action: 'accepted' | 'edited' | 'dismissed') {
    if (!selected || !reply) return;
    const finalText = action === 'dismissed' ? '' : draft;
    const realAction = action === 'accepted' && draft.trim() !== reply.text.trim() ? 'edited' : action;
    try {
      const result = await api<{ events: number }>('feedback', json('POST', { platform: selected.platform, relationship: selected.relationship, incoming: selected.text, suggestion: reply.text, finalText, action: realAction, engine: reply.engine }));
      setSaved(realAction === 'dismissed' ? 'Απορρίφθηκε. Δεν στάλθηκε τίποτα.' : `${realAction === 'edited' ? 'Η διόρθωσή σου' : 'Η απάντηση'} αποθηκεύτηκε ως νέο παράδειγμα του ύφους σου (${result.events} συνολικά). Δεν στάλθηκε τίποτα — ο δίδυμος μόνο προτείνει.`);
    } catch (failure) { setError((failure as Error).message); }
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    if (!custom.text.trim()) return;
    const message: InboxMessage = { id: `custom-${Date.now()}`, from: custom.from.trim() || 'Νέα επαφή', platform: custom.platform, relationship: custom.relationship, sentAt: new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 19), text: custom.text.trim(), note: 'Δικό σου μήνυμα' };
    setInbox(list => [message, ...(list ?? [])]);
    setSelected(message);
    setCustom(value => ({ ...value, text: '' }));
  }

  if (error && !inbox) return <div className="tw-page"><ErrorState error={error}/></div>;
  if (!inbox) return <div className="tw-page"><Loading/></div>;
  const twinCard = <section className={`tw-card tw-draft ${reply?.abstained ? 'abstained' : ''}`}>
    <div className="tw-card-head"><h3>Ο δίδυμός σου</h3>{reply && <div className="tw-row"><Badge tone={ENGINE[reply.engine].tone}>{ENGINE[reply.engine].label}</Badge><Badge>Ύφος: {RELATIONSHIP_LABEL[reply.register] ?? reply.register}</Badge></div>}</div>
    {loading && <Loading label="Ο δίδυμος σκέφτεται…"/>}
    {reply && !loading && <>
      {reply.abstained ? <p className="tw-abstain"><Info size={16}/>{reply.rationale}</p> : <>
        <textarea aria-label="Πρόχειρο απάντησης" value={draft} onChange={event => setDraft(event.target.value)} rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}/>
        <div className="tw-row"><button className="tw-button primary" onClick={() => feedback('accepted')}><Check size={15}/>Έγκριση</button><button className="tw-button" onClick={() => feedback('dismissed')}><X size={15}/>Απόρριψη</button><span className="tw-muted">Τίποτα δεν στέλνεται αυτόματα.</span></div>
      </>}
      {saved && <p className="tw-callout">{saved}</p>}
      <div className="tw-meters">
        <div><span>Βεβαιότητα</span><strong>{pct(reply.confidence)}</strong><i><b style={{ width: pct(reply.confidence) }}/></i></div>
        {!reply.abstained && <div><span>Ταίριασμα με το ύφος σου</span><strong>{pct(reply.style.score)}</strong><i><b style={{ width: pct(reply.style.score) }}/></i></div>}
      </div>
      {!reply.abstained && <p className="tw-rationale"><strong>Γιατί:</strong> {reply.rationale}</p>}
      {reply.style.notes.length > 0 && <ul className="tw-notes">{reply.style.notes.map(note => <li key={note}>{note}</li>)}</ul>}
      {reply.availability && <p className="tw-muted">📅 Ημερολόγιο: {reply.availability.reason}</p>}
    </>}
  </section>;

  return <div className="tw-page tw-studio">
    <PageHeader eyebrow="LIVE DEMO · REPLY STUDIO" title="Από τα δεδομένα σου σε απαντήσεις που ακούγονται σαν εσένα">
      Διάλεξε ένα εισερχόμενο. Ο δίδυμος βρίσκει παρόμοιες περιπτώσεις από το ιστορικό σου, τους τρόπους που αποφασίζεις και το ύφος σου για αυτή τη σχέση. Αν δεν είναι σίγουρος, απέχει.
    </PageHeader>
    {error && <ErrorState error={error}/>}
    <div className="tw-studio-grid">
      <aside className="tw-inbox">
        <form className="tw-card tw-custom" onSubmit={submitCustom}>
          <h3>Γράψε δικό σου μήνυμα</h3>
          <textarea aria-label="Εισερχόμενο μήνυμα" value={custom.text} onChange={event => setCustom(value => ({ ...value, text: event.target.value }))} rows={2} placeholder="π.χ. πάμε σινεμά απόψε;" maxLength={2000}/>
          <div className="tw-row">
            <input aria-label="Από" value={custom.from} onChange={event => setCustom(value => ({ ...value, from: event.target.value }))} placeholder="Από (όνομα)"/>
            <select aria-label="Πλατφόρμα" value={custom.platform} onChange={event => setCustom(value => ({ ...value, platform: event.target.value }))}>{['whatsapp', 'instagram', 'telegram', 'gmail'].map(platform => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}</select>
            <select aria-label="Σχέση" value={custom.relationship} onChange={event => setCustom(value => ({ ...value, relationship: event.target.value }))}>{['friend', 'family', 'study', 'work'].map(item => <option key={item} value={item}>{RELATIONSHIP_LABEL[item]}</option>)}</select>
            <button className="tw-button primary small" type="submit" disabled={!custom.text.trim()}><Send size={14}/>Δοκίμασε</button>
          </div>
        </form>
        <ul>{inbox.map(message => <li key={message.id}><button className={selected?.id === message.id ? 'active' : ''} onClick={() => setSelected(message)}>
          <header><strong>{message.from}</strong><small>{PLATFORM_LABEL[message.platform]} · {RELATIONSHIP_LABEL[message.relationship]}</small></header>
          <p>{message.text.split('\n').filter(Boolean).slice(0, 2).join(' ')}</p>
          <small>{message.note}</small>
        </button></li>)}</ul>
      </aside>
      <section className="tw-studio-main">
        {selected && <article className="tw-card tw-incoming-card">
          <div className="tw-card-head"><h3>{selected.from}</h3><span className="tw-muted">{PLATFORM_LABEL[selected.platform]} · {time(selected.sentAt)}</span></div>
          <p className="tw-bubble">{selected.text}</p>
          <label className="tw-switch"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)}/><Columns2 size={15}/>Σύγκριση: Γενικό AI vs ο δίδυμός σου</label>
        </article>}
        {compare ? <div className="tw-compare">
          <section className="tw-card tw-generic">
            <div className="tw-card-head"><h3>Γενικό AI</h3><Badge>ίδιο μοντέλο, χωρίς persona</Badge></div>
            {generic.loading && <p className="tw-muted"><Loader2 className="tw-spin" size={14}/> Παραγωγή…</p>}
            {generic.text && <p className="tw-bubble outgoing">{generic.text}</p>}
            {generic.error && <p className="tw-muted">{generic.error}{!aiAvailable && ' Δες στο Fidelity Lab πραγματικές συγκρίσεις από την τελευταία αξιολόγηση.'}</p>}
          </section>
          {twinCard}
        </div> : twinCard}
        {reply && !loading && <section className="tw-card">
          <h3>Τι χρησιμοποίησε</h3>
          {reply.facts.length > 0 && <><h4>Γεγονότα του persona</h4><ul className="tw-used-facts">{reply.facts.map(fact => <li key={fact.id}>{fact.statement} <small>{pct(fact.confidence)}</small></li>)}</ul></>}
          <h4>Παρόμοιες περιπτώσεις από το ιστορικό σου</h4>
          {reply.exemplars.length ? <ul className="tw-exemplars">{reply.exemplars.map(item => <li key={item.id}>
            <p className="tw-incoming">↳ {item.contact ? `${item.contact}: ` : ''}{item.incoming}</p>
            <p className="tw-owner-text">{item.reply}</p>
            <small>{PLATFORM_LABEL[item.platform] ?? item.platform} · ταίριασμα {item.score.toFixed(1)}{item.sameSituation ? ' · ίδια κατάσταση' : ''}{item.source === 'feedback' ? ' · από διόρθωσή σου' : ''}</small>
          </li>)}</ul> : <p className="tw-muted">Καμία αρκετά παρόμοια περίπτωση.</p>}
        </section>}
      </section>
    </div>
  </div>;
}
