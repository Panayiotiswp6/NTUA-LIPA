import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Play, Shuffle } from 'lucide-react';
import { api, json, RELATIONSHIP_LABEL } from './api';
import { Badge, ErrorState, Loading, PageHeader } from './ui';

interface Score { styleFit: number; lexical?: number; registerAccuracy: number; decision?: number }
interface Item { id: string; incoming: string; real: string; register: string; twin: string; baseline: string; twinEngine: string; lexical: { twin: number; baseline: number }; styleFit: { real: number; twin: number; baseline: number }; decision: { real: string; twin: string; baseline: string } }
interface LastAi { generatedAt: string; model: string; samples: number; note: string; summary: { twin: { similarity: number; relationshipAccuracy: number; register: number }; generic: { similarity: number; relationshipAccuracy: number; register: number } }; rows: Array<{ id: string; relationship: string; incoming: string; real: string; twin: string; generic: string }> }
interface AiRun { ranAt: string; model: string; n: number; twin: Record<string, number>; generic: Record<string, number> }
interface Fidelity {
  holdout: number; abstained: number; exact: number; feedbackEvents: number;
  overall: { n: number; twin: Score; baseline: Score; real: Score };
  byRegister: Array<{ register: string; label: string; n: number; twin: Score; baseline: Score }>;
  worst: Item[]; items: Item[];
  history: Array<{ at: string; feedbackEvents: number; styleFit: number; lexical: number }>;
  lastAiEval: LastAi; aiRun: AiRun | null; aiAvailable: boolean;
}
interface Blind { pairs: Array<{ id: string; incoming: string; contact: string; platform: string; options: string[] }>; results: { answered: number; fooled: number; confusion: number | null } }

const pct = (value?: number) => (value === undefined ? '—' : `${Math.round(value * 100)}%`);

function Compare({ label, twin, other, otherLabel, hint }: { label: string; twin: number; other: number; otherLabel: string; hint: string }) {
  return <div className="tw-metric" title={hint}>
    <span>{label}</span>
    <div className="tw-metric-bars">
      <div><small>Δίδυμος</small><i><b className="twin" style={{ width: pct(twin) }}/></i><strong>{pct(twin)}</strong></div>
      <div><small>{otherLabel}</small><i><b style={{ width: pct(other) }}/></i><strong>{pct(other)}</strong></div>
    </div>
  </div>;
}

function BlindTest() {
  const [data, setData] = useState<Blind | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ correct: boolean; real: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Blind>('fidelity/blind').then(setData, failure => setError((failure as Error).message)); }, []);
  if (error) return <ErrorState error={error}/>;
  if (!data) return <Loading/>;
  if (!data.pairs.length) return <p className="tw-muted">Δεν υπάρχουν ζεύγη για blind τεστ (οι απαντήσεις του δίδυμου ταυτίζονται με τις πραγματικές).</p>;
  const pair = data.pairs[index % data.pairs.length];
  const choose = async (choice: number) => {
    const answer = await api<{ correct: boolean; real: string; summary: Blind['results'] }>('fidelity/blind', json('POST', { id: pair.id, choice }));
    setResult(answer);
    setData(current => current && { ...current, results: answer.summary });
  };
  return <div className="tw-blind">
    <p className="tw-incoming">↳ {pair.contact}: «{pair.incoming}»</p>
    <p className="tw-muted">Ποια απάντηση έγραψες πραγματικά εσύ;</p>
    <div className="tw-blind-options">{pair.options.map((option, choice) => <button key={choice} disabled={!!result} className={result ? (option === result.real ? 'real' : 'twin') : ''} onClick={() => choose(choice)}>{option}</button>)}</div>
    {result && <p className={result.correct ? 'tw-good-text' : 'tw-warn-text'}>{result.correct ? 'Σωστά — αυτό το έγραψες εσύ.' : 'Σε ξεγέλασε ο δίδυμος! Αυτό το έγραψε εκείνος.'}</p>}
    <div className="tw-row"><button className="tw-button small" onClick={() => { setResult(null); setIndex(value => value + 1); }}><Shuffle size={14}/>Επόμενο</button>
      <span className="tw-muted">{data.results.answered ? `Ο δίδυμος σε ξεγέλασε ${data.results.fooled} από ${data.results.answered} φορές (${pct(data.results.confusion ?? 0)}). 50% = δεν ξεχωρίζει από σένα.` : 'Κάνε μερικές επιλογές για να μετρηθεί το ποσοστό σύγχυσης.'}</span></div>
  </div>;
}

export default function FidelityPage() {
  const [data, setData] = useState<Fidelity | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const load = useCallback(() => { setError(''); api<Fidelity>('fidelity').then(setData, failure => setError((failure as Error).message)); }, []);
  useEffect(load, [load]);
  const run = async () => {
    setRunning(true); setRunError('');
    try { await api('fidelity/run', { method: 'POST' }); load(); } catch (failure) { setRunError((failure as Error).message); }
    setRunning(false);
  };
  if (error) return <div className="tw-page"><ErrorState error={error} onRetry={load}/></div>;
  if (!data) return <div className="tw-page"><Loading label="Αξιολόγηση στο hold-out set…"/></div>;
  const ai = data.lastAiEval;
  return <div className="tw-page">
    <PageHeader eyebrow="APPROACH & RATIONALE · FIDELITY LAB" title="Πόσο «εσύ» είναι ο δίδυμος;">
      Το 12% των πραγματικών σου απαντήσεων κρατήθηκε εκτός εκπαίδευσης (δεν χρησιμοποιείται για ύφος, γεγονότα ή αναζήτηση). Ο δίδυμος απαντά στα ίδια μηνύματα και τον συγκρίνουμε με την πραγματική σου απάντηση και με μια εκδοχή χωρίς persona.
    </PageHeader>

    <section className="tw-card">
      <div className="tw-card-head"><h3><FlaskConical size={18}/>Hold-out αξιολόγηση (offline, δικός μας κώδικας)</h3><Badge>{data.holdout} κρυμμένες απαντήσεις · {data.abstained} αποχές</Badge></div>
      <div className="tw-metrics">
        <Compare label="Ίδια απόφαση με εσένα" twin={data.overall.twin.decision ?? 0} other={data.overall.baseline.decision ?? 0} otherLabel="Χωρίς persona" hint="Αρνείται / δέχεται / ζητά λεπτομέρειες / προτείνει άλλη μέρα, όπως εσύ (ταξινομητής ενεργειών)."/>
        <Compare label="Ταίριασμα με το ύφος σου" twin={data.overall.twin.styleFit} other={data.overall.baseline.styleFit} otherLabel="Χωρίς persona" hint="Ο δικός μας style scorer: μήκος, emoji, κεφαλαία, επισημότητα, γλώσσα, ανά περίσταση."/>
        <Compare label="Blind: σε ποιον απευθύνεται;" twin={data.overall.twin.registerAccuracy} other={data.overall.baseline.registerAccuracy} otherLabel="Χωρίς persona" hint="Χωρίς να ξέρει τον παραλήπτη, ο ταξινομητής βρίσκει τη σωστή σχέση από το ύφος."/>
        <Compare label="Ομοιότητα κειμένου" twin={data.overall.twin.lexical ?? 0} other={data.overall.baseline.lexical ?? 0} otherLabel="Χωρίς persona" hint="Character-trigram cosine με την πραγματική απάντηση (offline proxy)."/>
      </div>
      <p className="tw-muted">«Χωρίς persona» = ίδια αναζήτηση στο ιστορικό, αλλά χωρίς κατάσταση, σχέση, πρόσωπο και τρόπο απόφασης. Οι πραγματικές σου απαντήσεις παίρνουν {pct(data.overall.real.styleFit)} στο ίδιο ταίριασμα ύφους. Σημείωση: τα συνθετικά δεδομένα επαναλαμβάνουν φράσεις, γι’ αυτό {data.exact} από τις {data.overall.n} απαντήσεις ταυτίζονται λέξη προς λέξη· το μικρό δείγμα ({data.overall.n}) δείχνει κατεύθυνση, όχι benchmark.</p>
      <div className="tw-table-wrap"><table className="tw-table"><thead><tr><th>Περίσταση</th><th>n</th><th>Ίδια απόφαση</th><th>Ύφος</th><th>Blind σχέση</th></tr></thead><tbody>
        {data.byRegister.map(row => <tr key={row.register}><td>{RELATIONSHIP_LABEL[row.register] ?? row.label}</td><td>{row.n}</td><td>{pct(row.twin.decision)} <small>vs {pct(row.baseline.decision)}</small></td><td>{pct(row.twin.styleFit)} <small>vs {pct(row.baseline.styleFit)}</small></td><td>{pct(row.twin.registerAccuracy)} <small>vs {pct(row.baseline.registerAccuracy)}</small></td></tr>)}
      </tbody></table></div>
    </section>

    <section className="tw-card">
      <div className="tw-card-head"><h3>Με AI: δίδυμος vs γενικό μοντέλο</h3><Badge tone="accent">{ai.model} · {new Date(ai.generatedAt).toLocaleDateString('el-GR')}</Badge></div>
      <p className="tw-muted">{ai.note} Ίδιο μοντέλο, με και χωρίς persona και retrieval. Ομοιότητα με embeddings ({`text-embedding-3-large`}).</p>
      <div className="tw-metrics">
        <Compare label="Blind: σε ποιον απευθύνεται;" twin={ai.summary.twin.relationshipAccuracy} other={ai.summary.generic.relationshipAccuracy} otherLabel="Γενικό AI" hint="Η τύχη είναι 33%."/>
        <Compare label="Σωστό ύφος (πληθυντικός ευγενείας / χαλαρό)" twin={ai.summary.twin.register} other={ai.summary.generic.register} otherLabel="Γενικό AI" hint="Επίσημο προς καθηγήτρια, χαλαρό προς φίλη."/>
        <Compare label="Σημασιολογική ομοιότητα με την πραγματική" twin={ai.summary.twin.similarity} other={ai.summary.generic.similarity} otherLabel="Γενικό AI" hint="Cosine similarity embeddings."/>
      </div>
      <details><summary className="tw-link">Δες τις {ai.samples} απαντήσεις</summary><div className="tw-table-wrap"><table className="tw-table"><thead><tr><th>Έγραψαν</th><th>Πραγματική απάντηση</th><th>Δίδυμος</th><th>Γενικό AI</th></tr></thead><tbody>
        {ai.rows.map(row => <tr key={row.id}><td>{row.incoming}<small>{RELATIONSHIP_LABEL[row.relationship === 'professor' ? 'work' : row.relationship === 'classmate' ? 'study' : row.relationship] ?? row.relationship}</small></td><td>{row.real}</td><td>{row.twin}</td><td>{row.generic}</td></tr>)}
      </tbody></table></div></details>
      <div className="tw-row"><button className="tw-button" disabled={!data.aiAvailable || running} onClick={run}><Play size={15}/>{running ? 'Αξιολόγηση…' : 'Νέα αξιολόγηση με AI στο hold-out'}</button>{!data.aiAvailable && <span className="tw-muted">Διαθέσιμο με ενεργό AI.</span>}{runError && <span className="tw-error-text">{runError}</span>}</div>
      {data.aiRun && <p className="tw-muted">Τελευταία εκτέλεση ({data.aiRun.model}, {data.aiRun.n} ζεύγη): σημασιολογική ομοιότητα {pct(data.aiRun.twin.semantic)} vs {pct(data.aiRun.generic.semantic)} · κριτής LLM: πρόθεση {data.aiRun.twin.intent}/5 vs {data.aiRun.generic.intent}/5, ύφος {data.aiRun.twin.tone}/5 vs {data.aiRun.generic.tone}/5 · «θα το καταλάβαινε φίλος» {pct(data.aiRun.twin.noticed)} vs {pct(data.aiRun.generic.noticed)}.</p>}
    </section>

    <section className="tw-card">
      <h3>Blind τεστ: «Ποιο έγραψα εγώ;»</h3>
      <BlindTest/>
    </section>

    <section className="tw-grid-2">
      <div className="tw-card">
        <h3>Μαθαίνει και μένει ενημερωμένος</h3>
        <p className="tw-muted">Κάθε έγκριση ή διόρθωση στο Reply Studio γίνεται νέο παράδειγμα με μεγαλύτερο βάρος. Κάθε νέα εισαγωγή ενημερώνει ύφος και γεγονότα. Σημεία μέτρησης: {data.history.length} · διορθώσεις μέχρι τώρα: {data.feedbackEvents}.</p>
        <ol className="tw-history">{data.history.map(point => <li key={point.at}><span>{new Date(point.at).toLocaleString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span>{point.feedbackEvents} διορθώσεις</span><strong>ύφος {pct(point.styleFit)}</strong></li>)}</ol>
      </div>
      <div className="tw-card">
        <h3>Χειρότερες περιπτώσεις</h3>
        <ul className="tw-exemplars">{data.worst.map(item => <li key={item.id}><p className="tw-incoming">↳ {item.incoming}</p><p><strong>Εσύ:</strong> {item.real}</p><p><strong>Δίδυμος:</strong> {item.twin || '— απέχει —'}</p><small>απόφαση: {item.decision.real} / {item.decision.twin}</small></li>)}</ul>
      </div>
    </section>
  </div>;
}
