import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Check, FileArchive, Loader2, RotateCcw, Trash2, Upload, UserCheck } from 'lucide-react';
import { api, formatDate, json, LANG_LABEL, PLATFORM_LABEL, uploadFile, type ImportReport, type Lang, type Overview } from './api';
import { Badge, Empty, ErrorState, Loading, PageHeader, ShareBar } from './ui';

const HOW_TO = [
  ['WhatsApp', 'Συνομιλία → ⋮ → Εξαγωγή συνομιλίας → Χωρίς πολυμέσα (.zip ή .txt)'],
  ['Telegram', 'Telegram Desktop → Settings → Export Telegram data → JSON (result.json)'],
  ['Gmail', 'takeout.google.com → Mail → .mbox (ή ολόκληρο το Takeout .zip)'],
  ['Instagram / Messenger', 'Accounts Center → Download your information → Messages → JSON'],
  ['Σημειώσεις', '.md / .txt ή export από Obsidian / Notion (.zip)'],
];

const LANG_TONE: Record<Lang, string> = { el: 'tone-1', en: 'tone-2', greeklish: 'tone-3', mixed: 'tone-4', none: 'tone-5' };

interface Job { name: string; status: 'uploading' | 'done' | 'error'; report?: ImportReport; error?: string; stage: number }

export default function ImportPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ownerPick, setOwnerPick] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await api<Overview>('overview');
      setOverview(next);
      setOwnerPick(next.owner.participants.map(person => person.id));
    } catch (failure) { setError((failure as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      setJobs(list => [{ name: file.name, status: 'uploading', stage: 0 }, ...list]);
      try {
        const report = await uploadFile(file);
        // Reveal the pipeline stages one by one so the owner sees what happened to their data.
        for (let stage = 1; stage <= report.stages.length; stage++) {
          setJobs(list => list.map(job => job.name === file.name && job.status === 'uploading' ? { ...job, report, stage } : job));
          await new Promise(resolve => setTimeout(resolve, 280));
        }
        setJobs(list => list.map(job => job.name === file.name && job.status === 'uploading' ? { ...job, status: 'done', report } : job));
      } catch (failure) {
        setJobs(list => list.map(job => job.name === file.name && job.status === 'uploading' ? { ...job, status: 'error', error: (failure as Error).message } : job));
      }
    }
    setBusy(false);
    await load();
  }

  async function loadDemo() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ overview: Overview }>('demo', { method: 'POST' });
      setOverview(result.overview);
      setOwnerPick(result.overview.owner.participants.map(person => person.id));
      setJobs([]);
    } catch (failure) { setError((failure as Error).message); }
    setBusy(false);
  }

  async function confirmOwner() {
    try {
      await api('owner', json('POST', { participantIds: ownerPick }));
      await load();
    } catch (failure) { setError((failure as Error).message); }
  }

  async function toggleSource(id: string, included: boolean) {
    try { await api(`sources/${id}`, json('PATCH', { included })); await load(); } catch (failure) { setError((failure as Error).message); }
  }
  async function removeSource(id: string, name: string) {
    if (!window.confirm(`Διαγραφή της πηγής «${name}» και όλων των μηνυμάτων της;`)) return;
    try { await api(`sources/${id}`, { method: 'DELETE' }); await load(); } catch (failure) { setError((failure as Error).message); }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload([...event.dataTransfer.files]);
  };

  return <div className="tw-page">
    <PageHeader eyebrow="ΒΗΜΑ 1 · ΨΗΦΙΑΚΟ ΑΠΟΤΥΠΩΜΑ" title="Εισαγωγή δεδομένων">
      Σύρε εδώ τα επίσημα αρχεία εξαγωγής από κάθε πλατφόρμα. Η μορφή αναγνωρίζεται αυτόματα, ακόμα και μέσα σε zip. Όλα αποθηκεύονται μόνο τοπικά, στο Docker volume αυτού του υπολογιστή.
    </PageHeader>

    {error && <ErrorState error={error} onRetry={load}/>}

    <section className="tw-grid-2">
      <div
        className={`tw-dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Upload size={28}/>
        <strong>Σύρε αρχεία εξαγωγής εδώ</strong>
        <span>.zip · .txt · .json · .mbox · .md — έως 60 MB το καθένα</span>
        <div className="tw-row">
          <button className="tw-button primary" onClick={() => input.current?.click()} disabled={busy}><FileArchive size={16}/>Επιλογή αρχείων</button>
          <button className="tw-button" onClick={loadDemo} disabled={busy}><RotateCcw size={16}/>Φόρτωση demo persona</button>
        </div>
        <input ref={input} type="file" multiple hidden accept=".zip,.txt,.json,.mbox,.md,.markdown" onChange={event => { void upload([...(event.target.files ?? [])]); event.target.value = ''; }}/>
        <small>Το demo persona είναι ένα πλασματικό πρόσωπο (Αλέξανδρος, φοιτητής ΗΜΜΥ) με 6 μήνες συνθετικών εξαγωγών από 5 πλατφόρμες.</small>
      </div>
      <div className="tw-card">
        <h3>Πώς παίρνω τα αρχεία;</h3>
        <dl className="tw-howto">{HOW_TO.map(([platform, how]) => <div key={platform}><dt>{platform}</dt><dd>{how}</dd></div>)}</dl>
      </div>
    </section>

    {jobs.length > 0 && <section className="tw-card">
      <h3>Πρόοδος εισαγωγής</h3>
      <ul className="tw-jobs">{jobs.map((job, index) => <li key={`${job.name}-${index}`} className={job.status}>
        <header><strong>{job.name}</strong>{job.status === 'uploading' ? <Loader2 className="tw-spin" size={16}/> : job.status === 'done' ? <Badge tone="good">Ολοκληρώθηκε</Badge> : <Badge tone="bad">Απέτυχε</Badge>}</header>
        {job.error && <p className="tw-error-text">{job.error}</p>}
        {job.report && <ol className="tw-stages">{job.report.stages.map((stage, stageIndex) => <li key={stage.stage} className={stageIndex < job.stage || job.status === 'done' ? 'done' : ''}><Check size={13}/>{stage.label}<span>{stage.count.toLocaleString('el')}</span></li>)}<li className={job.status === 'done' ? 'done' : ''}><Check size={13}/>Ανανέωση persona<span>στατιστικά ύφους</span></li></ol>}
        {job.status === 'done' && job.report && <p className="tw-muted">{job.report.sources.map(source => `${PLATFORM_LABEL[source.platform] ?? source.platform}: +${source.stats.added} νέα, ${source.stats.duplicates} ήδη υπήρχαν`).join(' · ')}{job.report.unrecognised.length ? ` · ${job.report.unrecognised.length} αρχεία αγνοήθηκαν (πολυμέσα ή άγνωστη μορφή)` : ''}</p>}
      </li>)}</ul>
    </section>}

    {!overview && !error && <Loading/>}

    {overview && overview.counts.messages > 0 && <section className="tw-card">
      <div className="tw-card-head"><h3><UserCheck size={18}/>Ποιος είσαι εσύ;</h3>{overview.owner.confirmed ? <Badge tone="good">Επιβεβαιωμένο</Badge> : <Badge tone="warn">Χρειάζεται επιβεβαίωση</Badge>}</div>
      <p className="tw-muted">Ο δίδυμος μαθαίνει <strong>μόνο από τα δικά σου μηνύματα</strong>. Τα μηνύματα των άλλων χρησιμοποιούνται μόνο ως πλαίσιο (σε τι απαντούσες) και εμφανίζονται με ψευδώνυμα. Διάλεξε όλα τα ονόματα με τα οποία εμφανίζεσαι εσύ.</p>
      <div className="tw-chips">{overview.owner.candidates.map(candidate => <label key={candidate.id} className={`tw-chip ${ownerPick.includes(candidate.id) ? 'on' : ''}`}>
        <input type="checkbox" checked={ownerPick.includes(candidate.id)} onChange={event => setOwnerPick(list => event.target.checked ? [...list, candidate.id] : list.filter(id => id !== candidate.id))}/>
        {candidate.name}<small>{candidate.threads} συνομιλίες · {candidate.messages} μηνύματα</small>
      </label>)}</div>
      <div className="tw-row"><button className="tw-button primary" disabled={!ownerPick.length} onClick={confirmOwner}><Check size={16}/>Αυτός/ή είμαι εγώ</button>{overview.owner.confirmed && <button className="tw-button" onClick={() => onNavigate('persona')}>Δες το persona →</button>}</div>
    </section>}

    {overview && <section className="tw-card">
      <div className="tw-card-head"><h3>Πηγές</h3><span className="tw-muted">{overview.counts.messages.toLocaleString('el')} μηνύματα · {overview.counts.ownerMessages.toLocaleString('el')} δικά σου · {overview.counts.pairs.toLocaleString('el')} ζεύγη ερώτησης→απάντησης · {overview.counts.documents} έγγραφα</span></div>
      {!overview.sources.length ? <Empty title="Δεν υπάρχουν ακόμα δεδομένα">Ανέβασε μια εξαγωγή ή φόρτωσε το demo persona.</Empty> :
        <div className="tw-table-wrap"><table className="tw-table">
          <thead><tr><th>Πηγή</th><th>Μηνύματα</th><th>Περίοδος</th><th>Δικά σου</th><th>Γλώσσα</th><th>Χρήση</th><th/></tr></thead>
          <tbody>{overview.sources.map(source => <tr key={source.id} className={source.included ? '' : 'excluded'}>
            <td><strong>{PLATFORM_LABEL[source.kind] ?? source.kind}</strong><small>{source.filename}</small></td>
            <td>{source.stats.messages ? source.stats.messages.toLocaleString('el') : `${source.stats.documents} έγγραφα`}</td>
            <td>{source.stats.from ? `${formatDate(source.stats.from)} – ${formatDate(source.stats.to)}` : '—'}</td>
            <td>{source.stats.messages ? `${Math.round(source.stats.ownerShare * 100)}%` : '—'}</td>
            <td className="tw-lang-cell">{source.stats.messages ? <ShareBar parts={(Object.entries(source.stats.languages) as Array<[Lang, number]>).map(([lang, value]) => ({ label: LANG_LABEL[lang], value, tone: LANG_TONE[lang] }))}/> : 'γνώση'}</td>
            <td><label className="tw-switch"><input type="checkbox" checked={source.included} onChange={event => toggleSource(source.id, event.target.checked)}/><span>{source.included ? 'Ενεργή' : 'Εκτός'}</span></label></td>
            <td><button className="tw-icon-button" aria-label={`Διαγραφή ${source.filename}`} onClick={() => removeSource(source.id, source.filename)}><Trash2 size={16}/></button></td>
          </tr>)}</tbody>
        </table></div>}
    </section>}
  </div>;
}
