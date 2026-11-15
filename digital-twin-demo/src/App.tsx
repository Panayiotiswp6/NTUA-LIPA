import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Bell, Bookmark, ChevronDown, CircleHelp, Compass, Edit, Grid3X3, Heart, Home, Image, Inbox, Info, Instagram, Mail, Menu, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, RotateCcw, Search, Send, Settings2, ShieldCheck, Smile, Sparkles, Star, Users, Video, X } from 'lucide-react';
import { sourceRepository, suggestionProvider } from './domain';
import type { Channel, Contact, Message, Suggestion, Thread } from './domain';

const contacts = sourceRepository.getContacts();
const persona = sourceRepository.getPersona();
const initialThreads = () => structuredClone(sourceRepository.getThreads());
const avatarUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const getContact = (id: string) => contacts.find(c => c.id === id)!;
const lastIncoming = (thread: Thread) => [...thread.messages].reverse().find(m => m.author === 'contact');
const timeNow = () => new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
const makeId = () => crypto.randomUUID();

function Avatar({contact, size = '', className = ''}: {contact: Contact; size?: string; className?: string}) {
  return <img className={`avatar ${size} ${className}`} src={avatarUrl(contact.avatar)} alt={contact.name} />;
}
function App() {
  const [channel, setChannel] = useState<Channel>('instagram');
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [selected, setSelected] = useState<Record<Channel,string>>(() => ({instagram: sourceRepository.getThreads('instagram')[0].id, gmail: sourceRepository.getThreads('gmail')[0].id}));
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [suggestion, setSuggestion] = useState<Suggestion|null>(null);
  const [completion, setCompletion] = useState<Suggestion|null>(null);
  const [dismissedDraft, setDismissedDraft] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [panel, setPanel] = useState<'control'|'sources'|null>(null);
  const [sourceContactId, setSourceContactId] = useState<string|null>(null);
  const [evidence, setEvidence] = useState<Suggestion|null>(null);
  const [search, setSearch] = useState('');
  const [gmailFolder, setGmailFolder] = useState<'inbox'|'sent'|'starred'>('inbox');
  const [stars, setStars] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const thread = threads.find(t => t.id === selected[channel])!;
  const contact = getContact(thread.contactId);
  const draft = drafts[thread.id] || '';
  const sourceContact = getContact(sourceContactId || contact.id);
  const context = { channel, contact, history: thread.messages, lastIncoming: lastIncoming(thread), draft, sources: sourceRepository.getSources(contact.id) };
  const unread = threads.filter(t => t.channel === channel && t.unread).length;
  const showToast = (message: string) => setToast(message);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPanel(null); }
      if (event.key !== 'Tab') return;
      const controls = element?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [panel]);
  useEffect(() => { end.current?.scrollIntoView?.({behavior:'smooth',block:'end'}); }, [thread.messages.length, thread.id]);
  useEffect(() => { request.current++; setSuggestion(null); setCompletion(null); setEvidence(null); setLoading(false); setDismissedDraft(null); setSourceContactId(null); }, [thread.id, thread.messages.length]);
  useEffect(() => {
    let active = true;
    setCompletion(null);
    if (!draft.trim() || dismissedDraft === draft) return;
    const t = setTimeout(() => { suggestionProvider.autocomplete(context).then(result => { if (active) setCompletion(result); }).catch(() => { if(active) setCompletion(null); }); }, 230);
    return () => { active = false; clearTimeout(t); };
  }, [draft, thread.id, thread.messages.length, dismissedDraft]);

  const selectThread = (id: string) => { setSelected(s => ({...s,[channel]:id})); setThreads(ts => ts.map(t=>t.id===id?{...t,unread:false}:t)); };
  const changeChannel = (next: Channel) => {setChannel(next);setSearch('');setGmailFolder('inbox');};
  const editDraft = (text: string) => { setDrafts(d=>({...d,[thread.id]:text})); setDismissedDraft(null); setEvidence(null); };
  const suggest = async () => {
    const version = ++request.current; setLoading(true); setCompletion(null);
    try {const result = await suggestionProvider.suggestReply(context); if(version === request.current) setSuggestion(result);}
    catch {if(version === request.current) showToast('Η πρόταση δεν είναι διαθέσιμη. Δοκίμασε ξανά.');}
    finally {if(version === request.current) setLoading(false);}
  };
  const acceptCompletion = () => { if(!completion) return; setDrafts(d=>({...d,[thread.id]:(d[thread.id]||'')+completion.text})); setCompletion(null); setDismissedDraft(null); composer.current?.focus(); };
  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if(event.key === 'Tab' && completion) {event.preventDefault(); acceptCompletion();}
    if(event.key === 'Escape') {setCompletion(null);setDismissedDraft(draft);}
    if(event.key === 'Enter' && !event.shiftKey && channel==='instagram') {event.preventDefault(); sendMessage();}
  };
  const sendMessage = () => {
    if (!draft.trim()) return;
    const message: Message = {id:makeId(),author:'owner',text:draft.trim(),time:timeNow()};
    setThreads(ts=>ts.map(t=>t.id===thread.id?{...t,messages:[...t.messages,message],unread:false}:t));
    setDrafts(d=>({...d,[thread.id]:''}));setSuggestion(null);setCompletion(null);showToast('Η απάντηση στάλθηκε μέσα στο demo.');
  };
  const inject = (targetChannel: Channel, contactId: string, text: string, subject: string) => {
    const target = threads.find(t=>t.channel===targetChannel && t.contactId===contactId)!;
    setThreads(ts=>ts.map(t=>t.id===target.id?{...t,subject:targetChannel==='gmail'?subject.trim()||t.subject:t.subject,unread:true,messages:[...t.messages,{id:makeId(),author:'contact',text:text.trim(),time:timeNow()}]}:t));
    setChannel(targetChannel);setSelected(s=>({...s,[targetChannel]:target.id}));setSearch('');setGmailFolder('inbox');setPanel(null);showToast('Νέο εισερχόμενο μήνυμα · δοκίμασε Suggest reply');
  };
  const reset = () => {request.current++;setThreads(initialThreads());setSelected({instagram:sourceRepository.getThreads('instagram')[0].id,gmail:sourceRepository.getThreads('gmail')[0].id});setChannel('instagram');setDrafts({});setSuggestion(null);setCompletion(null);setEvidence(null);setSearch('');setStars([]);setGmailFolder('inbox');setPanel(null);showToast('Το demo επανήλθε στην αρχική του κατάσταση.');};
  const openSources = (why?: Suggestion) => {setPanel('sources');setSourceContactId(contact.id);setEvidence(why || null);};
  const filteredThreads = threads.filter(t => t.channel===channel && (gmailFolder!=='sent'||t.messages.some(m=>m.author==='owner')) && (gmailFolder!=='starred'||stars.includes(t.id)) && `${getContact(t.contactId).name} ${t.subject} ${t.messages.map(m=>m.text).join(' ')}`.toLocaleLowerCase('el').includes(search.toLocaleLowerCase('el')));
  const toggleStar = (id:string) => setStars(s=>s.includes(id)?s.filter(i=>i!==id):[...s,id]);

  const composerUI = <section className={`compose-area ${channel==='gmail'?'gmail-compose':''}`} aria-label="Reply composer">
    <div className="compose-toolbar"><div className="twin-label"><span className="sparkle-icon"><Sparkles size={15}/></span><strong>Your digital self</strong><span className="style-indicator">{contact.relationshipLabel}</span></div><button className="suggest-button" onClick={suggest} disabled={loading}><Sparkles size={14}/>{loading?'Thinking…':'Suggest reply'}</button></div>
    {suggestion && <div className="suggestion-card" data-testid="suggestion"><p>{suggestion.text}</p><div><button className="why-button" onClick={()=>openSources(suggestion)}><CircleHelp size={13}/>Why this suggestion?</button><button className="use-button" onClick={()=>{editDraft(suggestion.text);setSuggestion(null);composer.current?.focus();}}>Use suggestion <ArrowDown size={13}/></button></div></div>}
    <div className="message-input-wrap"><div className="ghost-text" aria-hidden="true"><span>{draft}</span><span className="completion-text">{completion?.text}</span></div><textarea ref={composer} aria-label="Reply message" placeholder={channel==='instagram'?'Message…':'Γράψε την απάντησή σου…'} value={draft} onChange={e=>editDraft(e.target.value)} onScroll={e=>{const ghost=e.currentTarget.previousElementSibling; if(ghost)ghost.scrollTop=e.currentTarget.scrollTop;}} onKeyDown={onComposerKey} rows={channel==='instagram'?2:4}/>{channel==='instagram'&&<Smile size={21} className="input-smile"/>}</div>
    <div className="compose-bottom"><div className="completion-controls">{completion?<><button onClick={acceptCompletion} className="accept-completion"><kbd>Tab</kbd> Accept completion</button><button className="why-button" onClick={()=>openSources(completion)}>Why this suggestion?</button><span className="esc-hint">Esc to dismiss</span></>:<span><span className="status-dot"/> Autocomplete ready <span className="hint-separator">·</span> Start typing in Greek</span>}</div><button className={`send-button ${channel==='gmail'?'gmail-send':''}`} onClick={sendMessage} disabled={!draft.trim()}>{channel==='gmail'?'Send':'Send'}<Send size={14}/></button></div>
  </section>;

  return <div className="desktop">
    <header className="workspace-bar"><a href="#" onClick={e=>{e.preventDefault();reset();}} className="brand"><span className="brand-symbol"><span/><span/></span><span>digital<span className="brand-light">self</span><span className="demo-pill">DEMO</span></span></a><nav className="workspace-nav" aria-label="Workspace apps"><button aria-label="Instagram" className={channel==='instagram'?'active':''} onClick={()=>changeChannel('instagram')}><Instagram size={17}/><span>Instagram</span></button><button aria-label="Gmail" className={channel==='gmail'?'active':''} onClick={()=>changeChannel('gmail')}><Mail size={17}/><span>Gmail</span></button><span className="nav-divider"/><button aria-label="Control Center" className={panel==='control'?'active':''} onClick={()=>setPanel(p=>p==='control'?null:'control')}><Settings2 size={17}/><span>Control Center</span></button><button aria-label="Sources" className={panel==='sources'?'active':''} onClick={()=>{if(panel==='sources')setPanel(null);else openSources();}}><Bookmark size={17}/><span>Sources</span></button></nav><div className="workspace-meta"><span className="synthetic"><span/>Demo · Synthetic data</span><button className="reset-icon" onClick={reset} title="Reset demo" aria-label="Reset demo"><RotateCcw size={16}/></button></div></header>
    <main className="desktop-content"><div className="workspace-intro"><div><div className="eyebrow">AI: YOUR DIGITAL SELF</div><h1>Your voice. Every conversation.</h1><p>A digital twin that understands who you’re talking to.</p></div><div className="demo-guide"><span className="guide-number">1</span> Receive a message <ArrowRight size={14}/><span className="guide-number">2</span> Find your words <ArrowRight size={14}/><span className="guide-number">3</span> Make it yours</div></div>
    <div className={`app-window ${channel}`}>
      <div className="window-top"><div className="window-dots"><i/><i/><i/></div><span>{channel==='instagram'?'instagram.com/direct/inbox':'mail.google.com/mail/u/0/#inbox'}</span><div className="window-account"><span className="status-dot"/> {persona.name}</div></div>
      {channel==='instagram'?<div className="instagram-layout">
        <aside className="ig-nav"><div className="instagram-wordmark">Instagram</div><div className="ig-nav-icons"><button aria-label="Home" onClick={()=>showToast('Το demo εστιάζει στα Direct Messages.')}><Home/></button><button aria-label="Search conversations" onClick={()=>document.querySelector<HTMLInputElement>('.conversation-search input')?.focus()}><Search/></button><button aria-label="Explore" onClick={()=>showToast('Το demo εστιάζει στα Direct Messages.')}><Compass/></button><button aria-label="Reels" onClick={()=>showToast('Το demo εστιάζει στα Direct Messages.')}><Video/></button><button aria-label="Messages" className="selected"><MessageCircle/>{unread>0&&<b>{unread}</b>}</button><button aria-label="Notifications" onClick={()=>showToast(`${unread} αδιάβαστες συνομιλίες`)}><Heart/></button><button aria-label="Create message" onClick={()=>setPanel('control')}><Plus/></button><img className="avatar small" src={avatarUrl(persona.avatar)} alt={persona.name}/></div><button className="ig-more" aria-label="More settings" onClick={()=>setPanel('control')}><Menu/></button></aside>
        <aside className="conversation-sidebar"><div className="account-row"><strong>{persona.username || 'alex.papadakis'}</strong><ChevronDown size={16}/><button aria-label="New message" onClick={()=>setPanel('control')}><Edit size={21}/></button></div><div className="notes-row">{contacts.filter(c=>c.channel==='instagram').map((c,i)=><button key={c.id} onClick={()=>selectThread(threads.find(t=>t.contactId===c.id)!.id)}><span className="note-bubble">{['Πάμε για καφέ; ☕','study mode 📚','Office hours'][i]}</span><Avatar contact={c}/><span>{c.firstName}</span></button>)}</div><div className="messages-title"><h2>Messages</h2><span>Requests</span></div><label className="conversation-search"><Search size={15}/><input aria-label="Search conversations" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="conversation-list">{filteredThreads.map(t=>{const c=getContact(t.contactId);return <button key={t.id} className={`conversation-row ${t.id===thread.id?'active':''}`} onClick={()=>selectThread(t.id)}><Avatar contact={c}/><span className="conversation-preview"><strong>{c.name}</strong><span className={t.unread?'unread-text':''}>{t.messages.at(-1)?.author==='owner'?'You: ':''}{t.messages.at(-1)?.text}</span></span><span className="conversation-time">{t.messages.at(-1)?.time}{t.unread&&<i className="unread-dot"/>}</span></button>;})}{!filteredThreads.length&&<p className="empty-state">Δεν βρέθηκαν συνομιλίες.</p>}</div><div className="sidebar-footer"><ShieldCheck size={13}/> A safe space to try your digital self</div></aside>
        <section className="chat-section"><header className="chat-header"><Avatar contact={contact}/><div><strong>{contact.name}</strong><span>Active now <span className="chat-header-dot">·</span> {contact.relationshipLabel}</span></div><div className="chat-actions"><button aria-label="Voice call" onClick={()=>showToast('Οι κλήσεις δεν περιλαμβάνονται στην προσομοίωση.')}><Phone size={21}/></button><button aria-label="Video call" onClick={()=>showToast('Οι κλήσεις δεν περιλαμβάνονται στην προσομοίωση.')}><Video size={23}/></button><button aria-label="Contact sources" onClick={()=>openSources()}><Info size={21}/></button></div></header>
          <div className="chat-history"><div className="contact-profile"><Avatar contact={contact} size="large"/><h3>{contact.name}</h3><p>{contact.username} · Instagram</p><span>You’re following each other on Instagram</span><button onClick={()=>openSources()}>View profile</button></div><div className="chat-date">TODAY</div>{thread.messages.map((m,i)=><div className={`message-group ${m.author}`} key={m.id}>{m.author==='contact'&&<Avatar contact={contact} size="tiny"/>}<div><div className="message-bubble">{m.text}</div>{i===thread.messages.length-1&&<span className="bubble-time">{m.author==='owner'?'Sent · ':''}{m.time}{m.author==='contact'&&thread.unread?' · New message':''}</span>}</div></div>)}<div ref={end}/></div>{composerUI}
        </section></div>:<div className="gmail-layout"><aside className="gmail-sidebar"><div className="gmail-logo"><Menu size={21}/><svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true"><path d="M3 23V4l14 11L31 4v19" fill="none" stroke="#4285f4" strokeWidth="6"/><path d="M3 5l14 11L31 5" fill="none" stroke="#ea4335" strokeWidth="6"/><path d="M3 10v13" stroke="#34a853" strokeWidth="6"/><path d="M31 10v13" stroke="#fbbc04" strokeWidth="6"/></svg><span>Gmail</span></div><button className="gmail-new" onClick={()=>setPanel('control')}><Pencil size={21}/>Compose</button><button className={`gmail-folder ${gmailFolder==='inbox'?'active':''}`} onClick={()=>setGmailFolder('inbox')}><Inbox size={18}/>Inbox <b>{unread}</b></button><button className={`gmail-folder ${gmailFolder==='starred'?'active':''}`} onClick={()=>setGmailFolder('starred')}><Star size={18}/>Starred</button><button className={`gmail-folder ${gmailFolder==='sent'?'active':''}`} onClick={()=>setGmailFolder('sent')}><Send size={18}/>Sent</button><div className="gmail-labels">Labels <Plus size={17}/></div><span className="gmail-label"><i/>University</span><span className="gmail-label"><i/>Personal</span><div className="sidebar-footer"><ShieldCheck size={13}/> All mail is synthetic</div></aside><section className="gmail-main"><header className="gmail-topbar"><label><Search size={21}/><input aria-label="Search mail" placeholder="Search mail" value={search} onChange={e=>setSearch(e.target.value)}/><Settings2 size={19}/></label><button aria-label="Mail help" onClick={()=>openSources()}><CircleHelp size={21}/></button><button aria-label="Control Center settings" onClick={()=>setPanel('control')}><Settings2 size={21}/></button><img className="avatar small" src={avatarUrl(persona.avatar)} alt={persona.name}/></header><div className="gmail-mailbox"><div className="gmail-inbox-list"><div className="inbox-heading"><Inbox size={17}/><strong>{gmailFolder==='inbox'?'Primary':gmailFolder==='sent'?'Sent':'Starred'}</strong><span>{filteredThreads.length} conversations</span></div>{filteredThreads.map(t=>{const c=getContact(t.contactId);return <div className={`email-row ${t.id===thread.id?'selected':''} ${t.unread?'unread':''}`} key={t.id}><button aria-label={`Star ${c.name}`} onClick={()=>toggleStar(t.id)}><Star size={15} fill={stars.includes(t.id)?'#f4b400':'none'}/></button><button className="email-select" onClick={()=>selectThread(t.id)}><strong>{c.name}</strong><span><b>{t.subject}</b><span> — {t.messages.at(-1)?.text}</span></span><small>{t.messages.at(-1)?.time}{t.unread&&<i className="unread-dot"/>}</small></button></div>;})}{!filteredThreads.length&&<p className="empty-state">Δεν υπάρχουν μηνύματα.</p>}</div><div className="gmail-thread"><div className="gmail-thread-toolbar"><ArrowLeft size={18}/><span>Conversation</span><button aria-label="View email sources" onClick={()=>openSources()}><MoreHorizontal size={20}/></button></div><h2>{thread.subject}<span>Inbox</span></h2><div className="gmail-messages">{thread.messages.map(m=><article className="email-message" key={m.id}>{m.author==='contact'?<Avatar contact={contact}/>:<img className="avatar" src={avatarUrl(persona.avatar)} alt={persona.name}/>}<div><header><strong>{m.author==='contact'?contact.name:persona.name}</strong><small>&lt;{m.author==='contact'?contact.email:persona.email}&gt;</small><time>{m.time}</time></header><span className="email-recipient">to {m.author==='contact'?'me':contact.firstName} <ChevronDown size={11}/></span><p>{m.text}</p></div></article>)}<div ref={end}/></div>{composerUI}</div></div></section></div>}
    </div><footer className="desktop-footer"><span><span className="status-dot"/> Your words. Your choice. You always press send.</span><span>NETCOMPANY HACKATHON <b>ATHENS 2026</b></span><button onClick={()=>setPanel('control')}>Try a scenario <ArrowRight size={13}/></button></footer></main>
    {panel&&<div className="panel-backdrop" onClick={()=>setPanel(null)}><aside ref={dialog} className="side-panel" role="dialog" aria-modal="true" aria-label={panel==='control'?'Control Center':'Sources'} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setPanel(null);}}><header className="panel-header"><div><span className="eyebrow">DIGITAL SELF WORKSPACE</span><h2>{panel==='control'?'Control Center':'The voice behind the words'}</h2></div><button aria-label="Close panel" onClick={()=>setPanel(null)}><X size={21}/></button></header>{panel==='control'?<ControlPanel channel={channel} contactId={contact.id} onInject={inject} onReset={reset}/>:<div className="sources-content"><p className="panel-description">Every suggestion starts with a relationship and examples of your own writing.</p><label className="form-label">CONTACT<select value={sourceContact.id} onChange={e=>{setSourceContactId(e.target.value);setEvidence(null);}}>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.channel==='gmail'?'Gmail':'Instagram'}</option>)}</select></label><div className="source-profile"><Avatar contact={sourceContact} size="large"/><div><h3>{sourceContact.name}</h3><p>{sourceContact.relationshipLabel}</p><small>{sourceContact.email}</small></div></div><div className="style-tags">{sourceContact.style.map(s=><span key={s}>{s}</span>)}</div><h4>Signature expressions</h4><p className="expressions">{sourceContact.expressions.map(s=>`“${s}”`).join('  ·  ')}</p>{evidence&&<div className="evidence-box"><h3><Sparkles size={17}/>Why this suggestion?</h3><p>{evidence.text}</p><div className="style-tags">{evidence.traits.map(t=><span key={t}>{t}</span>)}</div><small>Based on: {evidence.sourceIds.join(', ')}</small></div>}<h4>{evidence?'Examples used in this suggestion':'Conversation sources'} <span>{sourceRepository.getSources(sourceContact.id).length} samples</span></h4>{sourceRepository.getSources(sourceContact.id).filter(s=>!evidence||evidence.sourceIds.includes(s.id)).map(s=><article className="source-sample" key={s.id}><header><code>{s.id}</code><span>{s.intent}</span></header><label>{sourceContact.firstName}</label><p>{s.contactText}</p><label className="owner-source">{persona.name} <span>OWNER WRITING SAMPLE</span></label><p className="owner-example">{s.ownerText}</p></article>)}<p className="source-note"><ShieldCheck size={15}/>Synthetic examples. No real accounts or private conversations.</p></div>}</aside></div>}
    {toast&&<div className="toast" role="status"><ShieldCheck size={16}/>{toast}</div>}
  </div>;
}

function ControlPanel({channel,contactId,onInject,onReset}:{channel:Channel;contactId:string;onInject:(c:Channel,id:string,text:string,subject:string)=>void;onReset:()=>void}) {
  const [app,setApp] = useState<Channel>(channel);
  const [sender,setSender] = useState(contactId);
  const [message,setMessage] = useState('Θες να πάμε για καφέ μετά τη σχολή;');
  const [subject,setSubject] = useState('Συνάντηση για την εργασία');
  const scenario = (relationship:Contact['relationship']) => {const c=contacts.find(c=>c.channel===app&&c.relationship===relationship)!;setSender(c.id);setMessage(relationship==='friend'?'Θες να πάμε για καφέ μετά τη σχολή;':relationship==='classmate'?'Μπορείς να μου εξηγήσεις τι ζητάει η εργασία;':'Καλησπέρα Αλέξανδρε, θα ήθελα να συζητήσουμε την εργασία σας. Πότε σας εξυπηρετεί;');setSubject(relationship==='professor'?'Συζήτηση για την εργασία':'Συνάντηση μετά τη σχολή');};
  const submit = (e:FormEvent) => {e.preventDefault();if(message.trim())onInject(app,sender,message,subject);};
  return <div className="control-content"><p className="panel-description">Be the person on the other side. Send a message and watch the digital self adapt.</p><div className="quick-scenarios"><span className="form-label">START WITH A SCENARIO</span><div><button onClick={()=>scenario('friend')}><Smile size={18}/>A friend</button><button onClick={()=>scenario('classmate')}><Users size={18}/>A classmate</button><button onClick={()=>scenario('professor')}><Bookmark size={18}/>A professor</button></div></div><form onSubmit={submit}><label className="form-label">APPLICATION<div className="app-toggle"><button type="button" className={app==='instagram'?'active':''} onClick={()=>{setApp('instagram');setSender(contacts.find(c=>c.channel==='instagram')!.id);}}><Instagram size={17}/>Instagram</button><button type="button" className={app==='gmail'?'active':''} onClick={()=>{setApp('gmail');setSender(contacts.find(c=>c.channel==='gmail')!.id);}}><Mail size={17}/>Gmail</button></div></label><label className="form-label">SENDER<select value={sender} onChange={e=>setSender(e.target.value)}>{contacts.filter(c=>c.channel===app).map(c=><option key={c.id} value={c.id}>{c.name} · {c.relationshipLabel}</option>)}</select></label>{app==='gmail'&&<label className="form-label">SUBJECT<input value={subject} onChange={e=>setSubject(e.target.value)} required/></label>}<label className="form-label">INCOMING MESSAGE<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} required/></label><button className="inject-button" type="submit" disabled={!message.trim()}>Inject message <ArrowRight size={17}/></button><p className="form-note">Appears instantly in the selected inbox as unread.</p></form><div className="how-to"><h3>A one-minute test</h3><ol><li>Inject a message from a friend.</li><li>Click <strong>Suggest reply</strong> and explore why.</li><li>Use the suggestion, edit it and send.</li><li>Switch to a professor. Notice the voice change.</li><li>Type <strong>Ναι</strong> in a reply and press <kbd>Tab</kbd>.</li></ol></div><button className="reset-demo" onClick={onReset}><RotateCcw size={16}/>Reset demo</button><span className="reset-caption">Restore conversations and clear all drafts.</span></div>;
}
export default App;
