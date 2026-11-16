import { useState } from 'react';
import type { FormEvent } from 'react';
import { Info, Send } from 'lucide-react';
import { api, json } from './api';
import { Badge, ErrorState, Loading, PageHeader } from './ui';

interface Answer { answer: string; citations: Array<{ id: string; text: string }>; confidence: number; engine: string; abstained: boolean; mode: 'as_owner' | 'about_owner' }

const EXAMPLES = [
  'Τι θα έλεγα αν η Μαρία μου πρότεινε «πάμε σινεμά απόψε;»',
  'Πότε πάω γυμναστήριο;',
  'Τι ξέρω για Python;',
  'Πώς αποφασίζω όταν με καλούν τελευταία στιγμή;',
  'Τι θα απαντούσα στο «Να κάνουμε call απόψε για την εργασία;»',
  'Ποιο είναι το αγαπημένο μου φαγητό;',
];

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asked, setAsked] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ask(text: string) {
    if (!text.trim()) return;
    setLoading(true); setError(''); setAsked(text);
    try { setAnswer(await api<Answer>('ask', json('POST', { question: text }))); } catch (failure) { setError((failure as Error).message); setAnswer(null); }
    setLoading(false);
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(question); };

  return <div className="tw-page">
    <PageHeader eyebrow="ASK MY TWIN" title="Ρώτα τον δίδυμό σου">
      Ρώτα τι θα έλεγες σε μια κατάσταση ή τι ξέρει ο δίδυμος για σένα. Κάθε απάντηση έχει παραπομπές και βεβαιότητα· αν δεν υπάρχουν στοιχεία, λέει «δεν ξέρω».
    </PageHeader>
    <form className="tw-ask" onSubmit={submit}>
      <input aria-label="Ερώτηση" value={question} onChange={event => setQuestion(event.target.value)} placeholder="π.χ. Τι θα έλεγα αν ένας συμφοιτητής μού ζητούσε να μοιράσουμε μια εργασία;" maxLength={500}/>
      <button className="tw-button primary" type="submit" disabled={!question.trim() || loading}><Send size={15}/>Ρώτα</button>
    </form>
    <div className="tw-chips">{EXAMPLES.map(example => <button key={example} className="tw-chip" onClick={() => { setQuestion(example); void ask(example); }}>{example}</button>)}</div>
    {loading && <Loading label="Ο δίδυμος σκέφτεται…"/>}
    {error && <ErrorState error={error}/>}
    {answer && !loading && <section className={`tw-card ${answer.abstained ? 'tw-abstain-card' : ''}`}>
      <div className="tw-card-head"><h3>{asked}</h3><div className="tw-row"><Badge tone={answer.abstained ? 'warn' : answer.engine === 'twin-llm' ? 'accent' : 'neutral'}>{answer.abstained ? 'Δεν ξέρει' : answer.engine === 'twin-llm' ? 'LLM με παραπομπές' : 'Offline · από τα δεδομένα σου'}</Badge><Badge>Βεβαιότητα {Math.round(answer.confidence * 100)}%</Badge></div></div>
      {answer.abstained ? <p className="tw-abstain"><Info size={16}/>{answer.answer}</p> : <p className="tw-answer">{answer.answer}</p>}
      {answer.citations.length > 0 && <><h4>Παραπομπές</h4><ol className="tw-citations">{answer.citations.map(citation => <li key={citation.id}><code>{citation.id}</code> {citation.text}</li>)}</ol></>}
    </section>}
  </div>;
}
