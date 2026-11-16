import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { api, formatDate, json, LANG_LABEL, PLATFORM_LABEL, RELATIONSHIP_LABEL, type Lang, type OwnerState, type Thread } from './api';
import { Badge, Empty, ErrorState, Loading, PageHeader, ShareBar } from './ui';

type Category = 'knowledge' | 'preference' | 'decision_pattern' | 'relationship' | 'habit';
interface Fact { id: string; category: Category; statement: string; confidence: number; evidence: string[]; status: 'auto' | 'confirmed' | 'edited' | 'rejected'; origin: 'rules' | 'llm' | 'owner'; updated_at: string }
interface Metrics {
  messages: number; avgWords: number; medianChars: number; lengthBuckets: Record<string, number>; sentencesPerMessage: number;
  punctuation: { exclamation: number; doubleExclamation: number; ellipsis: number; question: number; noFinalPunctuation: number };
  capitalizedStart: number; emojiRate: number; emojisPerMessage: number; topEmojis: Array<{ emoji: string; count: number }>;
  openers: Array<{ phrase: string; count: number }>; signOffs: Array<{ phrase: string; count: number }>; catchphrases: Array<{ phrase: string; count: number }>;
  formality: number; informality: number; medianReplyMinutes: number | null; languages: Partial<Record<Lang, number>>; codeSwitching: number; activeHours: number[];
}
interface Persona { owner: OwnerState; facts: Fact[]; style: { computedAt: string; global: Metrics; byRelationship: Record<string, Metrics>; byPlatform: Record<string, Metrics> } | null; aiAvailable: boolean }
interface Evidence { messages: Array<{ id: string; sentAt: string; text: string; isOwner: number; platform: string; thread: string; replyTo: string | null }>; documents: Array<{ id: string; title: string; text: string }> }

const TABS: Array<{ id: string; label: string; categories?: Category[] }> = [
  { id: 'knowledge', label: 'Γνώσεις', categories: ['knowledge'] },
  { id: 'style', label: 'Ύφος' },
  { id: 'preferences', label: 'Προτιμήσεις & συνήθειες', categories: ['preference', 'habit'] },
  { id: 'decisions', label: 'Αποφάσεις', categories: ['decision_pattern'] },
  { id: 'relationships', label: 'Σχέσεις', categories: ['relationship'] },
];
const ORIGIN: Record<Fact['origin'], { label: string; tone: 'accent' | 'neutral' | 'good'; title: string }> = {
  rules: { label: 'Δική μας ανάλυση', tone: 'neutral', title: 'Βγήκε από τους δικούς μας κανόνες και στατιστικά, χωρίς AI.' },
  llm: { label: 'AI εξαγωγή', tone: 'accent', title: 'Βγήκε με LLM από αποκρυμμένα (redacted) μηνύματα, με παραπομπές.' },
  owner: { label: 'Από εσένα', tone: 'good', title: 'Το πρόσθεσες εσύ.' },
};
const CATEGORY_LABEL: Record<Category, string> = { knowledge: 'Γνώση', preference: 'Προτίμηση', habit: 'Συνήθεια', decision_pattern: 'Τρόπος απόφασης', relationship: 'Σχέση' };
const LANG_TONE: Record<Lang, string> = { el: 'tone-1', en: 'tone-2', greeklish: 'tone-3', mixed: 'tone-4', none: 'tone-5' };
const pct = (value: number) => `${Math.round(value * 100)}%`;

function EvidenceList({ ids }: { ids: string[] }) {
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Evidence>(`evidence?ids=${ids.join(',')}`).then(setData, failure => setError((failure as Error).message)); }, [ids]);
  if (error) return <p className="tw-error-text">{error}</p>;
  if (!data) return <Loading label="Φόρτωση αποδείξεων…"/>;
  if (!data.messages.length && !data.documents.length) return <p className="tw-muted">Δεν υπάρχουν αποθηκευμένες αποδείξεις (προστέθηκε από εσένα).</p>;
  return <ul className="tw-evidence">
    {data.documents.map(document => <li key={document.id}><small>Σημείωση · {document.title}</small><p>{document.text.slice(0, 280)}{document.text.length > 280 ? '…' : ''}</p></li>)}
    {data.messages.map(message => <li key={message.id}>
      <small>{PLATFORM_LABEL[message.platform] ?? message.platform} · {message.thread} · {formatDate(message.sentAt)} <code>{message.id}</code></small>
      {message.replyTo && <p className="tw-incoming">↳ {message.replyTo}</p>}
      <p className="tw-owner-text">{message.text}</p>
    </li>)}
  </ul>;
}

function FactCard({ fact, onChange }: { fact: Fact; onChange: (id: string, change: { status?: string; statement?: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.statement);
  const origin = ORIGIN[fact.origin];
  return <article className={`tw-fact ${fact.status}`}>
    <div className="tw-fact-main">
      <p>{fact.statement}</p>
      {editing && <div className="tw-row"><textarea aria-label="Διόρθωση γεγονότος" value={draft} onChange={event => setDraft(event.target.value)} rows={2}/><button className="tw-button small primary" onClick={async () => { await onChange(fact.id, { statement: draft }); setEditing(false); }}>Αποθήκευση</button><button className="tw-button small" onClick={() => setEditing(false)}>Άκυρο</button></div>}
      <div className="tw-fact-meta">
        <span className="tw-confidence" title="Βεβαιότητα"><i style={{ width: pct(fact.confidence) }}/></span><span>{pct(fact.confidence)}</span>
        <span title={origin.title}><Badge tone={origin.tone}>{origin.label}</Badge></span>
        {fact.status === 'confirmed' && <Badge tone="good">Επιβεβαιωμένο</Badge>}
        {fact.status === 'edited' && <Badge tone="good">Διορθωμένο από εσένα</Badge>}
        {fact.status === 'rejected' && <Badge tone="bad">Απορρίφθηκε · δεν χρησιμοποιείται</Badge>}
        <small>{CATEGORY_LABEL[fact.category]}</small>
      </div>
    </div>
    <div className="tw-fact-actions">
      {fact.status !== 'rejected' ? <>
        <button className="tw-icon-button ok" aria-label="Σωστό" title="Σωστό" onClick={() => onChange(fact.id, { status: 'confirmed' })}><Check size={16}/></button>
        <button className="tw-icon-button" aria-label="Διόρθωση" title="Διόρθωση" onClick={() => { setDraft(fact.statement); setEditing(true); }}><Pencil size={15}/></button>
        <button className="tw-icon-button" aria-label="Λάθος" title="Λάθος — να μη χρησιμοποιείται" onClick={() => onChange(fact.id, { status: 'rejected' })}><X size={16}/></button>
      </> : <button className="tw-button small" onClick={() => onChange(fact.id, { status: 'auto' })}>Επαναφορά</button>}
      {fact.evidence.length > 0 && <button className="tw-button small" aria-expanded={open} onClick={() => setOpen(value => !value)}>Αποδείξεις ({fact.evidence.length}) {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</button>}
    </div>
    {open && <EvidenceList ids={fact.evidence}/>}
  </article>;
}

function Bars({ values, labels, label }: { values: number[]; labels: string[]; label: string }) {
  const max = Math.max(1, ...values);
  return <div className="tw-bars" role="img" aria-label={`${label}: ${values.map((value, index) => `${labels[index]} ${value}`).join(', ')}`}>
    {values.map((value, index) => <div key={labels[index]} className="tw-bar"><span style={{ height: `${(value / max) * 100}%` }} title={`${labels[index]}: ${value}`}/><small>{labels[index]}</small></div>)}
  </div>;
}

function langParts(languages: Partial<Record<Lang, number>>) {
  return (Object.entries(languages) as Array<[Lang, number]>).map(([lang, value]) => ({ label: LANG_LABEL[lang], value, tone: LANG_TONE[lang] }));
}

function StyleTab({ style }: { style: NonNullable<Persona['style']> }) {
  const g = style.global;
  const registers = (['friend', 'family', 'study', 'work'] as const).filter(name => style.byRelationship[name]);
  return <div className="tw-stack">
    <section className="tw-card">
      <div className="tw-card-head"><h3>Η φωνή σου σε αριθμούς</h3><Badge>Δική μας ανάλυση · {g.messages} δικά σου μηνύματα</Badge></div>
      <div className="tw-voice">
        <div><strong>{g.avgWords}</strong><span>λέξεις ανά μήνυμα</span></div>
        <div><strong>{pct(g.emojiRate)}</strong><span>μηνύματα με emoji {g.topEmojis.slice(0, 3).map(item => item.emoji).join(' ')}</span></div>
        <div><strong>{pct(1 - g.capitalizedStart)}</strong><span>ξεκινούν με πεζό</span></div>
        <div><strong>{g.medianReplyMinutes ?? '—'}′</strong><span>διάμεσος χρόνος απάντησης</span></div>
        <div><strong>{pct(g.punctuation.question)}</strong><span>με ερώτηση («;» ή «?»)</span></div>
        <div><strong>{pct(g.formality)}</strong><span>επίσημη διατύπωση</span></div>
      </div>
      <div className="tw-grid-2">
        <div><h4>Γλώσσα</h4><ShareBar parts={langParts(g.languages)}/><p className="tw-muted">Εναλλαγή γλώσσας μέσα στη συζήτηση: {pct(g.codeSwitching)}</p></div>
        <div><h4>Χαρακτηριστικές φράσεις</h4><div className="tw-chips">{g.catchphrases.slice(0, 8).map(item => <span key={item.phrase} className="tw-chip static">«{item.phrase}»<small>×{item.count}</small></span>)}</div></div>
      </div>
      <div className="tw-grid-2">
        <div><h4>Μήκος μηνυμάτων (λέξεις)</h4><Bars label="Κατανομή μήκους" values={Object.values(g.lengthBuckets)} labels={Object.keys(g.lengthBuckets)}/></div>
        <div><h4>Ώρες που γράφεις</h4><Bars label="Μηνύματα ανά ώρα" values={g.activeHours} labels={g.activeHours.map((_, hour) => (hour % 6 === 0 ? `${hour}` : ''))}/></div>
      </div>
    </section>
    <section className="tw-card">
      <div className="tw-card-head"><h3>Ένας άνθρωπος, πολλές φωνές</h3><span className="tw-muted">Το ίδιο πρόσωπο γράφει αλλιώς ανάλογα με τη σχέση</span></div>
      <div className="tw-registers">{registers.map(name => { const m = style.byRelationship[name]; return <div key={name} className="tw-register">
        <h4>{RELATIONSHIP_LABEL[name]}<small>{m.messages} μηνύματα</small></h4>
        <dl>
          <div><dt>Λέξεις/μήνυμα</dt><dd>{m.avgWords}</dd></div>
          <div><dt>Emoji</dt><dd>{pct(m.emojiRate)} {m.topEmojis.slice(0, 2).map(item => item.emoji).join('')}</dd></div>
          <div><dt>Κεφαλαίο στην αρχή</dt><dd>{pct(m.capitalizedStart)}</dd></div>
          <div><dt>Επίσημο</dt><dd>{pct(m.formality)}</dd></div>
          <div><dt>Greeklish</dt><dd>{pct((m.languages.greeklish ?? 0) / Math.max(1, m.messages))}</dd></div>
        </dl>
        <p>{m.catchphrases.slice(0, 3).map(item => `«${item.phrase}»`).join(' · ')}</p>
        {m.signOffs[0] && <small>Κλείσιμο: «{m.signOffs[0].phrase}»</small>}
      </div>; })}</div>
    </section>
  </div>;
}

function RelationshipsEditor({ onChanged }: { onChanged: () => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api<{ threads: Thread[] }>('threads').then(result => setThreads(result.threads), failure => setError((failure as Error).message)); }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error}/>;
  if (!threads) return <Loading/>;
  return <section className="tw-card">
    <h3>Συνομιλίες και σχέση</h3>
    <p className="tw-muted">Η σχέση βγαίνει αυτόματα από το περιεχόμενο. Διόρθωσέ την αν χρειάζεται: καθορίζει ποιο ύφος χρησιμοποιεί ο δίδυμος.</p>
    <div className="tw-table-wrap"><table className="tw-table"><thead><tr><th>Συνομιλία</th><th>Μηνύματα</th><th>Σχέση</th></tr></thead><tbody>
      {threads.map(thread => <tr key={thread.id}><td><strong>{thread.title}</strong><small>{PLATFORM_LABEL[thread.platform] ?? thread.platform}</small></td><td>{thread.messages} ({thread.ownerMessages} δικά σου)</td>
        <td><select aria-label={`Σχέση για ${thread.title}`} value={thread.relationship} onChange={async event => { await api(`threads/${thread.id}`, json('PATCH', { relationship: event.target.value })); load(); onChanged(); }}>
          {Object.entries(RELATIONSHIP_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>{thread.relationshipSource === 'owner' && <Badge tone="good">από εσένα</Badge>}</td></tr>)}
    </tbody></table></div>
  </section>;
}

export default function PersonaPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('decisions');
  const [adding, setAdding] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => { setError(''); api<Persona>('persona').then(setPersona, failure => setError((failure as Error).message)); }, []);
  useEffect(load, [load]);

  const change = async (id: string, update: { status?: string; statement?: string }) => {
    try { const result = await api<{ facts: Fact[] }>(`persona/facts/${id}`, json('PATCH', update)); setPersona(current => current && { ...current, facts: result.facts }); } catch (failure) { setError((failure as Error).message); }
  };
  const extract = async () => {
    setExtracting(true); setNotice('');
    try { const result = await api<{ added: number; merged: number; facts: Fact[] }>('persona/extract', { method: 'POST' }); setPersona(current => current && { ...current, facts: result.facts }); setNotice(`AI εξαγωγή: ${result.added} νέα γεγονότα, ${result.merged} ενισχύθηκαν.`); } catch (failure) { setNotice((failure as Error).message); }
    setExtracting(false);
  };

  if (error) return <div className="tw-page"><ErrorState error={error} onRetry={load}/></div>;
  if (!persona) return <div className="tw-page"><Loading/></div>;
  const ownerName = persona.owner.participants[0]?.name;
  if (!ownerName) return <div className="tw-page"><PageHeader eyebrow="PERSONA MODEL" title="Ποιος νομίζει ο δίδυμος ότι είσαι"/><Empty title="Δεν υπάρχει ακόμα ιδιοκτήτης">Εισήγαγε δεδομένα και επιβεβαίωσε ποιος είσαι.<button className="tw-button primary" onClick={() => onNavigate('import')}>Εισαγωγή</button></Empty></div>;
  const current = TABS.find(item => item.id === tab)!;
  const facts = persona.facts.filter(fact => current.categories?.includes(fact.category));
  const active = facts.filter(fact => fact.status !== 'rejected');
  const rejected = facts.filter(fact => fact.status === 'rejected');

  return <div className="tw-page">
    <PageHeader eyebrow="PERSONA MODEL" title={`Ποιος νομίζει ο δίδυμος ότι είσαι, ${ownerName.split(' ')[0]}`}>
      Όλα όσα ξέρει ο δίδυμος, με βεβαιότητα και αποδείξεις. Επιβεβαίωσε, διόρθωσε ή απόρριψε οτιδήποτε· τα απορριφθέντα δεν χρησιμοποιούνται ποτέ ξανά.
    </PageHeader>
    <div className="tw-row tw-persona-actions">
      <span className="tw-muted">{persona.facts.filter(fact => fact.status !== 'rejected').length} γεγονότα · {persona.facts.filter(fact => fact.origin === 'rules').length} από τη δική μας ανάλυση · {persona.facts.filter(fact => fact.origin === 'llm').length} από AI</span>
      <button className="tw-button" onClick={extract} disabled={!persona.aiAvailable || extracting} title={persona.aiAvailable ? 'Εξαγωγή γνώσεων και προτιμήσεων με LLM από αποκρυμμένα μηνύματα' : 'Διαθέσιμο όταν είναι ενεργό το AI'}><Sparkles size={15}/>{extracting ? 'Εξαγωγή…' : 'Εμπλουτισμός με AI'}</button>
    </div>
    {notice && <p className="tw-callout">{notice}</p>}
    <div className="tw-tabs" role="tablist">{TABS.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}{item.categories && <small>{persona.facts.filter(fact => item.categories!.includes(fact.category) && fact.status !== 'rejected').length}</small>}</button>)}</div>

    {tab === 'style' ? (persona.style?.global.messages ? <StyleTab style={persona.style}/> : <Empty title="Δεν υπάρχουν αρκετά δικά σου μηνύματα για ανάλυση ύφους"/>) : <>
      {!active.length && <Empty title="Τίποτα εδώ ακόμα">{persona.aiAvailable ? 'Δοκίμασε «Εμπλουτισμός με AI» ή πρόσθεσε κάτι μόνος σου.' : 'Πρόσθεσε κάτι μόνος σου ή εισήγαγε περισσότερα δεδομένα.'}</Empty>}
      <div className="tw-stack">{active.map(fact => <FactCard key={fact.id} fact={fact} onChange={change}/>)}</div>
      <form className="tw-add-fact" onSubmit={async event => { event.preventDefault(); if (!adding.trim()) return; try { const result = await api<{ facts: Fact[] }>('persona/facts', json('POST', { category: current.categories![0], statement: adding })); setPersona(value => value && { ...value, facts: result.facts }); setAdding(''); } catch (failure) { setError((failure as Error).message); } }}>
        <input aria-label="Νέο γεγονός" value={adding} onChange={event => setAdding(event.target.value)} placeholder={`Πρόσθεσε ${CATEGORY_LABEL[current.categories![0]].toLocaleLowerCase('el')} που λείπει…`} maxLength={500}/>
        <button className="tw-button" type="submit" disabled={!adding.trim()}><Plus size={15}/>Προσθήκη</button>
      </form>
      {tab === 'relationships' && <RelationshipsEditor onChanged={load}/>}
      {rejected.length > 0 && <details className="tw-rejected"><summary>Απορριφθέντα ({rejected.length}) — δεν χρησιμοποιούνται</summary><div className="tw-stack">{rejected.map(fact => <FactCard key={fact.id} fact={fact} onChange={change}/>)}</div></details>}
    </>}
  </div>;
}
