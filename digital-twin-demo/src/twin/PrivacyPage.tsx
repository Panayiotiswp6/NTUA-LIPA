import { useCallback, useEffect, useState } from 'react';
import { Download, EyeOff, HardDrive, Lock, Trash2, UserCheck } from 'lucide-react';
import { api, json, PLATFORM_LABEL, type Source } from './api';
import { Badge, ErrorState, Loading, PageHeader } from './ui';

interface Privacy {
  aiEnabled: boolean; messages: number; otherPeopleMessages: number; redactedMessages: number;
  redactions: { names: number; emails: number; phones: number; identifiers: number };
  pseudonyms: Array<{ pseudonym: string; n: number }>; sources: Source[];
}

const SAMPLE = 'Μίλησα με τη Μαρία, το κινητό της είναι 6912345678 και το email maria.georgiou@example.com. ΑΦΜ 123456789.';

export default function PrivacyPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<Privacy | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState(SAMPLE);
  const [preview, setPreview] = useState('');
  const [deleted, setDeleted] = useState(false);
  const load = useCallback(() => { setError(''); api<Privacy>('privacy').then(setData, failure => setError((failure as Error).message)); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = setTimeout(() => { api<{ text: string }>('redact-preview', json('POST', { text })).then(result => setPreview(result.text), () => setPreview('')); }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const toggle = async (id: string, included: boolean) => { try { await api(`sources/${id}`, json('PATCH', { included })); load(); } catch (failure) { setError((failure as Error).message); } };
  const remove = async (id: string, name: string) => { if (!window.confirm(`Διαγραφή της πηγής «${name}»;`)) return; try { await api(`sources/${id}`, { method: 'DELETE' }); load(); } catch (failure) { setError((failure as Error).message); } };
  const deleteAll = async () => {
    if (!window.confirm('Διαγραφή ΟΛΩΝ των δεδομένων, του persona και των διορθώσεων από αυτόν τον υπολογιστή; Δεν αναιρείται.')) return;
    try { await api('all', { method: 'DELETE' }); setDeleted(true); load(); } catch (failure) { setError((failure as Error).message); }
  };

  return <div className="tw-page">
    <PageHeader eyebrow="PRIVACY & CONTROL" title="Τα δεδομένα σου μένουν δικά σου">
      Ο δίδυμος δουλεύει τοπικά. Εσύ αποφασίζεις τι μαθαίνει, τι ξεχνά και τι στέλνεται — και τίποτα δεν στέλνεται εκ μέρους σου.
    </PageHeader>
    {error && <ErrorState error={error} onRetry={load}/>}
    <section className="tw-principles">
      <div><HardDrive size={20}/><strong>Τοπική αποθήκευση</strong><span>Όλα αποθηκεύονται σε ένα Docker volume σε αυτόν τον υπολογιστή. Δεν υπάρχει cloud βάση.</span></div>
      <div><EyeOff size={20}/><strong>Μόνο redacted κείμενο φεύγει</strong><span>{data?.aiEnabled ? 'Το AI είναι ενεργό: πριν από κάθε κλήση, ονόματα τρίτων γίνονται ψευδώνυμα και αφαιρούνται emails, τηλέφωνα, ΑΦΜ/ΑΜΚΑ, IBAN, κάρτες.' : 'Το AI είναι ανενεργό: τίποτα δεν φεύγει από τον υπολογιστή.'}</span></div>
      <div><UserCheck size={20}/><strong>Οι άλλοι είναι μόνο πλαίσιο</strong><span>Τα μηνύματα των άλλων δείχνουν σε τι απαντούσες. Δεν χρησιμοποιούνται για ύφος και δεν γίνονται γεγονότα για εκείνους.</span></div>
      <div><Lock size={20}/><strong>Ποτέ αυτόματη αποστολή</strong><span>Ο δίδυμος μόνο προτείνει. Κάθε απάντηση χρειάζεται τη δική σου έγκριση.</span></div>
    </section>

    <section className="tw-card">
      <h3>Δοκίμασε το redaction</h3>
      <p className="tw-muted">Αυτό ακριβώς βλέπει ένα μοντέλο AI. Τα ονόματα επανέρχονται τοπικά στην απάντηση.</p>
      <div className="tw-grid-2">
        <textarea aria-label="Κείμενο για redaction" className="tw-textarea" value={text} onChange={event => setText(event.target.value)} rows={4} maxLength={2000}/>
        <div className="tw-redacted" aria-live="polite">{preview || '…'}</div>
      </div>
      {data && <p className="tw-muted">Στα δεδομένα σου: {data.redactedMessages.toLocaleString('el')} από {data.messages.toLocaleString('el')} μηνύματα έχουν κάτι κρυμμένο · {data.redactions.names} με ονόματα τρίτων, {data.redactions.emails} με emails, {data.redactions.phones} με τηλέφωνα, {data.redactions.identifiers} με αναγνωριστικά. {data.pseudonyms.length} πρόσωπα με ψευδώνυμο.</p>}
    </section>

    {!data && !error && <Loading/>}
    {data && <section className="tw-card">
      <div className="tw-card-head"><h3>Τι μαθαίνει ο δίδυμος</h3><button className="tw-button small" onClick={() => onNavigate('import')}>Προσθήκη δεδομένων</button></div>
      {data.sources.length ? <div className="tw-table-wrap"><table className="tw-table"><thead><tr><th>Πηγή</th><th>Μηνύματα</th><th>Χρήση</th><th/></tr></thead><tbody>
        {data.sources.map(source => <tr key={source.id} className={source.included ? '' : 'excluded'}><td><strong>{PLATFORM_LABEL[source.kind] ?? source.kind}</strong><small>{source.filename}</small></td><td>{source.stats.messages || `${source.stats.documents} έγγραφα`}</td>
          <td><label className="tw-switch"><input type="checkbox" checked={source.included} onChange={event => toggle(source.id, event.target.checked)}/>{source.included ? 'Ο δίδυμος μαθαίνει από αυτή' : 'Εξαιρείται'}</label></td>
          <td><button className="tw-icon-button" aria-label={`Διαγραφή ${source.filename}`} onClick={() => remove(source.id, source.filename)}><Trash2 size={16}/></button></td></tr>)}
      </tbody></table></div> : <p className="tw-muted">{deleted ? 'Όλα διαγράφηκαν. Ο δίδυμος δεν θυμάται τίποτα.' : 'Δεν υπάρχουν δεδομένα.'}</p>}
      <div className="tw-row">
        <a className="tw-button" href="api/twin/export" download><Download size={15}/>Εξαγωγή του persona μου (JSON)</a>
        <button className="tw-button danger" onClick={deleteAll}><Trash2 size={15}/>Διαγραφή όλων</button>
        <Badge tone={data.aiEnabled ? 'accent' : 'good'}>{data.aiEnabled ? 'AI ενεργό · μόνο redacted κείμενο' : 'AI ανενεργό · τίποτα δεν φεύγει'}</Badge>
      </div>
    </section>}
  </div>;
}
