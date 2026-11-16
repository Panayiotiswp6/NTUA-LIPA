import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  Archive, ArrowLeft, ArrowRight, Bell, Bookmark, Calendar, Check, CheckSquare,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock, Compass, Edit,
  Grid3X3, Heart, Home, Image, Inbox, Info, Instagram, Lightbulb, Link,
  Mail, Maximize2, Menu, MessageCircle, Mic, Minus, MoreHorizontal, MoreVertical,
  Paperclip, Pencil, Phone, Plus, RefreshCw, Reply, RotateCcw, Search, Send,
  BrainCircuit, Settings2, ShieldCheck, Smile, Sparkles, Square, Star, Tag, Trash2, Type,
  Users, Video, X,
} from 'lucide-react';
import { sourceRepository } from './domain';
import type { Channel, Contact, Message, Suggestion, Thread } from './domain';
import { useGhostSuggestion } from './useGhostSuggestion';
import { useAiStatus } from './ai/provider';
import type { AiStatus } from './ai/provider';
import CalendarPanel from './components/CalendarPanel';
import TwinWorkspace from './twin/TwinWorkspace';
import { initialScheduleEvents, DEFAULT_REFERENCE_DATE } from './domain/scheduleData';
import type { ScheduleEvent } from './domain/scheduleTypes';
import { demoScenarios } from './domain/demoScenarios';
import './availability.css';
import './ai.css';

const contacts = sourceRepository.getContacts();
const persona = sourceRepository.getPersona();
const initialThreads = () => structuredClone(sourceRepository.getThreads());
const getContact = (id: string) => contacts.find(contact => contact.id === id)!;
const lastIncoming = (thread: Thread) => [...thread.messages].reverse().find(message => message.author === 'contact');
const timeNow = () => new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
const initialSelected = () => ({ instagram: sourceRepository.getThreads('instagram')[0].id, gmail: sourceRepository.getThreads('gmail')[0].id });

function Avatar({ contact, size = '', className = '' }: { contact?: Contact; size?: string; className?: string }) {
  const profile = contact || persona;
  return <span className={`avatar ${size} ${className}`} role="img" aria-label={profile.name} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}${profile.avatar})`, backgroundSize: profile.avatarSize || 'cover', backgroundPosition: profile.avatarPosition || '50% 50%', backgroundRepeat: 'no-repeat' }} />;
}

function GmailLogo() {
  return <svg width="33" height="27" viewBox="0 0 34 28" aria-hidden="true"><path d="M3 25V5l14 11L31 5v20" fill="none" stroke="#4285f4" strokeWidth="6" strokeLinejoin="round"/><path d="M3 5l14 11L31 5" fill="none" stroke="#ea4335" strokeWidth="6" strokeLinejoin="round"/><path d="M3 11v14" stroke="#34a853" strokeWidth="6"/><path d="M31 11v14" stroke="#fbbc04" strokeWidth="6"/></svg>;
}

function App() {
  const [channel, setChannel] = useState<Channel>('instagram');
  const [twinOpen, setTwinOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [selected, setSelected] = useState<Record<Channel, string>>(initialSelected);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<'control' | 'sources' | 'calendar' | null>(null);
  const [sourceContactId, setSourceContactId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Suggestion | null>(null);
  const [search, setSearch] = useState('');
  const [gmailFolder, setGmailFolder] = useState<'inbox' | 'sent' | 'starred'>('inbox');
  const [gmailView, setGmailView] = useState<'inbox' | 'thread'>('inbox');
  const [floatingCompose, setFloatingCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [stars, setStars] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [calendarEvents, setCalendarEvents] = useState<ScheduleEvent[]>(() => structuredClone(initialScheduleEvents));
  const [referenceDate, setReferenceDate] = useState(DEFAULT_REFERENCE_DATE);
  const [availabilityInfo, setAvailabilityInfo] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | undefined>();
  const composer = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const thread = threads.find(item => item.id === selected[channel])!;
  const contact = getContact(thread.contactId);
  const draft = drafts[thread.id] || '';
  const sourceContact = getContact(sourceContactId || contact.id);
  const context = { channel, contact, history: thread.messages, lastIncoming: lastIncoming(thread), draft, sources: sourceRepository.getSources(contact.id), calendarEvents, referenceDate, meetingDurationMinutes: 60 };
  const ghost = useGhostSuggestion({ context, enabled: thread.messages.at(-1)?.author === 'contact' || !!draft });
  const ai = useAiStatus();
  const unread = threads.filter(item => item.channel === channel && item.unread).length;
  const showToast = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setEvidence(null);
    setSourceContactId(null);
  }, [thread.id]);
  useEffect(() => { setAvailabilityInfo(false); }, [thread.id, thread.messages.length, draft, referenceDate, calendarEvents]);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [thread.messages.length, thread.id, gmailView]);
  useEffect(() => {
    if (channel !== 'instagram' || !composer.current) return;
    const textarea = composer.current;
    textarea.style.height = 'auto';
    const overlay = textarea.previousElementSibling as HTMLElement | null;
    textarea.style.height = `${Math.min(118, Math.max(42, textarea.scrollHeight, overlay?.scrollHeight || 0))}px`;
  }, [channel, draft, ghost.suggestion?.text]);
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

  const selectThread = (id: string) => {
    setSelected(current => ({ ...current, [channel]: id }));
    setThreads(current => current.map(item => item.id === id ? { ...item, unread: false } : item));
    if (channel === 'gmail') { setGmailView('thread'); setFloatingCompose(false); }
  };
  const changeChannel = (next: Channel) => {
    setTwinOpen(false);
    setChannel(next);
    setSearch('');
    setGmailFolder('inbox');
    setGmailView('inbox');
    setFloatingCompose(false);
  };
  const editDraft = (text: string) => {
    setDrafts(current => ({ ...current, [thread.id]: text }));
    setEvidence(null);
  };
  const acceptGhost = () => {
    if (!ghost.suggestion) return;
    setDrafts(current => ({ ...current, [thread.id]: (current[thread.id] || '') + ghost.suggestion!.text }));
    ghost.dismiss();
    composer.current?.focus();
  };
  const sendMessage = () => {
    if (!draft.trim()) return;
    const message: Message = { id: crypto.randomUUID(), author: 'owner', text: draft.trim(), time: timeNow() };
    setThreads(current => current.map(item => item.id === thread.id ? {
      ...item, subject: floatingCompose && composeSubject.trim() ? composeSubject.trim() : item.subject,
      messages: [...item.messages, message], unread: false,
    } : item));
    setDrafts(current => ({ ...current, [thread.id]: '' }));
    ghost.dismiss();
    if (floatingCompose) setFloatingCompose(false);
    showToast('Η απάντηση στάλθηκε μέσα στο demo.');
  };
  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab' && !event.shiftKey && ghost.suggestion) { event.preventDefault(); acceptGhost(); }
    if (event.key === 'Escape') ghost.dismiss();
    if (event.key === 'Enter' && !event.shiftKey && channel === 'instagram') { event.preventDefault(); sendMessage(); }
  };
  const inject = (targetChannel: Channel, contactId: string, text: string, subject: string) => {
    const target = threads.find(item => item.channel === targetChannel && item.contactId === contactId)!;
    setThreads(current => current.map(item => item.id === target.id ? {
      ...item, subject: targetChannel === 'gmail' ? subject.trim() || item.subject : item.subject,
      unread: true, messages: [...item.messages, { id: crypto.randomUUID(), author: 'contact', text: text.trim(), time: timeNow() }],
    } : item));
    setChannel(targetChannel);
    setSelected(current => ({ ...current, [targetChannel]: target.id }));
    setSearch(''); setGmailFolder('inbox'); setGmailView('thread'); setFloatingCompose(false); setPanel(null);
    showToast('Νέο εισερχόμενο μήνυμα · πάτησε Tab για την αχνή πρόταση');
  };
  const reset = () => {
    setThreads(initialThreads()); setSelected(initialSelected()); setChannel('instagram'); setDrafts({});
    setEvidence(null); setSearch(''); setStars([]); setGmailFolder('inbox'); setGmailView('inbox');
    setFloatingCompose(false); setPanel(null); setCalendarEvents(structuredClone(initialScheduleEvents)); setReferenceDate(DEFAULT_REFERENCE_DATE); setAvailabilityInfo(false); ghost.refresh();
    showToast('Το demo επανήλθε στην αρχική του κατάσταση.');
  };
  const openSources = (why?: Suggestion) => { setPanel('sources'); setSourceContactId(contact.id); setEvidence(why || null); };
  const filteredThreads = threads.filter(item => item.channel === channel
    && (gmailFolder !== 'sent' || item.messages.some(message => message.author === 'owner'))
    && (gmailFolder !== 'starred' || stars.includes(item.id))
    && `${getContact(item.contactId).name} ${item.subject} ${item.messages.map(message => message.text).join(' ')}`.toLocaleLowerCase('el').includes(search.toLocaleLowerCase('el')));
  const toggleStar = (id: string) => setStars(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const selectFolder = (folder: 'inbox' | 'sent' | 'starred') => { setGmailFolder(folder); setGmailView('inbox'); };
  const openCompose = () => { setComposeSubject(''); setFloatingCompose(true); setComposeMinimized(false); };

  const composerUI = (floating = false) => <section className={`compose-area ${channel === 'gmail' ? 'gmail-compose' : ''} ${floating ? 'floating' : ''}`} aria-label="Reply composer">
    {channel === 'gmail' && !floating && <div className="inline-reply-heading"><Reply size={17} /><span>{contact.name}</span><ChevronDown size={14}/></div>}
    <div className="composer-pill">
      {channel === 'instagram' && <button className="composer-emoji" aria-label="Add emoji" onClick={() => { editDraft(`${draft}🙂`); composer.current?.focus(); }}><Smile size={24}/></button>}
      <div className="message-input-wrap">
        <div className="ghost-text" aria-hidden="true"><span>{draft}</span><span className="completion-text" data-testid="ghost-suggestion">{ghost.suggestion?.text}</span></div>
        <textarea ref={composer} aria-label="Reply message" placeholder={ghost.suggestion ? '' : channel === 'instagram' ? 'Message…' : 'Γράψε την απάντησή σου…'} value={draft}
          onChange={event => editDraft(event.target.value)}
          onScroll={event => { const overlay = event.currentTarget.previousElementSibling; if (overlay) overlay.scrollTop = event.currentTarget.scrollTop; }}
          onKeyDown={onComposerKey} rows={channel === 'instagram' ? 1 : floating ? 12 : 4}/>
      </div>
      {channel === 'instagram' && <div className="composer-attachments">{draft.trim() ? <button className="send-button" aria-label="Send" onClick={sendMessage}>Send</button> : <><button aria-label="Record voice message" onClick={() => showToast('Δοκίμασε μια γραπτή απάντηση μέσα στο demo.')}><Mic size={22}/></button><button aria-label="Attach image" onClick={() => showToast('Τα συνημμένα δεν περιλαμβάνονται στο demo.')}><Image size={22}/></button><button aria-label="Send sticker" onClick={() => { editDraft('🙂'); composer.current?.focus(); }}><Heart size={22}/></button></>}</div>}
    </div>
    <div className="compose-assist-row">
      <div className="completion-controls">{ghost.suggestion ? <><button className="accept-completion" aria-label="Accept completion" onClick={acceptGhost}><kbd>Tab</kbd><span>Αποδοχή</span></button><button className="why-button" onClick={() => openSources(ghost.suggestion!)}>Why this suggestion?</button>{ghost.suggestion.availability && <button className="availability-info-button" aria-label="Why this availability?" aria-expanded={availabilityInfo} aria-controls="availability-details" title="Γιατί προτείνεται αυτή η διαθεσιμότητα;" onClick={() => setAvailabilityInfo(value => !value)}><Info size={17}/></button>}<EngineChip suggestion={ghost.suggestion}/><span className="esc-hint">Esc για απόκρυψη</span></> : <span className="autocomplete-status">{ghost.loading ? (ai.state === 'online' ? 'Ο ψηφιακός σου εαυτός γράφει…' : 'Προετοιμασία πρότασης…') : 'Γράψε για αυτόματη συμπλήρωση'}</span>}</div>
      <button className="suggest-button" aria-label="Suggest reply" title="Ανανέωση πρότασης" onClick={ghost.refresh} disabled={ghost.loading}><Sparkles size={14}/><span>AI</span></button>
    </div>
    {availabilityInfo && ghost.suggestion?.availability && <div id="availability-details" className="availability-explanation" role="dialog" aria-label="Availability explanation"><header><strong><Calendar size={16}/> Γιατί αυτή η απάντηση;</strong><button aria-label="Close availability explanation" onClick={() => setAvailabilityInfo(false)}><X size={16}/></button></header><p>{ghost.suggestion.availability.reason}</p>{ghost.suggestion.availability.conflicts.map(event => <div className="availability-conflict" key={`${event.id}-${event.date}`}><strong>{event.title}</strong><span>{event.originalStart}–{event.originalEnd}{event.status === 'tentative' ? ' · πιθανή δέσμευση' : ' · επιβεβαιωμένο'}</span><small>{event.source}</small></div>)}{ghost.suggestion.availability.durationAssumed && <small>Χωρίς δηλωμένη λήξη, ο έλεγχος καλύπτει 60 λεπτά. Οι χρόνοι μετακίνησης δεν έχουν καταχωριστεί.</small>}<div className="availability-footer"><code>{ghost.suggestion.availability.sourceIds.join(' · ') || 'Καμία σύγκρουση με καταχωρισμένο γεγονός'}</code><button onClick={() => {setCalendarFocusDate(ghost.suggestion?.availability?.date);setAvailabilityInfo(false);setPanel('calendar');}}>Προβολή ημερολογίου <ArrowRight size={13}/></button></div></div>}
    {channel === 'gmail' && <><div className="gmail-format-toolbar" aria-hidden="true"><span>↶</span><span>↷</span><i/><span>Sans Serif</span><ChevronDown size={12}/><i/><Type size={17}/><ChevronDown size={12}/><i/><strong>B</strong><em>I</em><u>U</u><i/><span>A̲</span><ChevronDown size={12}/><i/><Menu size={17}/><MoreHorizontal size={17}/></div><div className="compose-bottom"><button className="send-button gmail-send" aria-label="Send" onClick={sendMessage} disabled={!draft.trim()}>Αποστολή <ChevronDown size={15}/></button><div className="gmail-compose-actions"><button aria-label="Formatting options" onClick={() => composer.current?.focus()}><Type size={18}/></button><button aria-label="Attach file" onClick={() => showToast('Τα συνημμένα δεν περιλαμβάνονται στο demo.')}><Paperclip size={17}/></button><button aria-label="Insert link" onClick={() => { editDraft(`${draft} https://example.com`); composer.current?.focus(); }}><Link size={18}/></button><button aria-label="Add emoji" onClick={() => { editDraft(`${draft}🙂`); composer.current?.focus(); }}><Smile size={18}/></button><button aria-label="Insert photo" onClick={() => showToast('Τα συνημμένα δεν περιλαμβάνονται στο demo.')}><Image size={18}/></button><button aria-label="More compose options" onClick={() => openSources()}><MoreVertical size={18}/></button></div><button className="discard-draft" aria-label="Discard draft" onClick={() => { editDraft(''); ghost.dismiss(); if (floating) setFloatingCompose(false); }}><Trash2 size={17}/></button></div></>}
  </section>;

  const instagramUI = <div className="instagram-layout">
    <aside className="ig-nav">
      <button className="ig-logo" aria-label="Instagram home" onClick={() => showToast('Instagram Direct · Synthetic demo')}><Instagram size={24}/></button>
      <div className="ig-nav-icons">
        <button aria-label="Home" onClick={() => showToast('Το demo εστιάζει στα Direct Messages.')}><Home/></button>
        <button aria-label="Reels" onClick={() => showToast('Το demo εστιάζει στα Direct Messages.')}><Video/></button>
        <button aria-label="Messages" className="selected"><Send/>{unread > 0 && <b>{unread}</b>}</button>
        <button aria-label="Search conversations" onClick={() => document.querySelector<HTMLInputElement>('.conversation-search input')?.focus()}><Search/></button>
        <button aria-label="Notifications" onClick={() => showToast(`${unread} αδιάβαστες συνομιλίες`)}><Heart/></button>
        <button aria-label="Create message" onClick={() => setPanel('control')}><Plus/></button>
        <button aria-label="Your profile" onClick={() => openSources()}><Avatar size="small"/></button>
      </div>
      <div className="ig-bottom-nav"><button className="ig-more" aria-label="More settings" onClick={() => setPanel('control')}><Menu/></button><button aria-label="More apps" onClick={() => changeChannel('gmail')}><Grid3X3 size={22}/></button></div>
    </aside>
    <aside className="conversation-sidebar">
      <div className="account-row"><strong>{persona.username.replace('.demo', '')}</strong><ChevronDown size={16}/><button aria-label="New message" onClick={() => setPanel('control')}><Edit size={23}/></button></div>
      <label className="conversation-search"><Search size={17}/><input aria-label="Search conversations" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="notes-row"><button onClick={() => openSources()}><span className="note-bubble">Your note</span><Avatar/><span>Your note</span></button>{contacts.filter(item => item.channel === 'instagram').map((item, index) => <button key={item.id} onClick={() => selectThread(threads.find(value => value.contactId === item.id)!.id)}><span className="note-bubble">{['☕ coffee break', 'study mode 📚', 'Office hours'][index]}</span><Avatar contact={item}/><span>{item.firstName}</span></button>)}</div>
      <div className="messages-title"><h2>Messages</h2><button onClick={() => showToast('Δεν υπάρχουν εκκρεμή αιτήματα στο demo.')}>Requests</button></div>
      <div className="conversation-list">{filteredThreads.map(item => { const person = getContact(item.contactId); return <button key={item.id} className={`conversation-row ${item.id === thread.id ? 'active' : ''}`} onClick={() => selectThread(item.id)}><Avatar contact={person}/><span className="conversation-preview"><strong>{person.name}</strong><span className={item.unread ? 'unread-text' : ''}>{item.messages.at(-1)?.author === 'owner' ? 'You: ' : ''}{item.messages.at(-1)?.text}<span className="preview-time"> · {item.messages.at(-1)?.time}</span></span></span>{item.unread && <i className="unread-dot"/>}</button>; })}{!filteredThreads.length && <p className="empty-state">Δεν βρέθηκαν συνομιλίες.</p>}</div>
    </aside>
    <section className="chat-section">
      <header className="chat-header"><Avatar contact={contact}/><div><strong>{contact.name}</strong><span>{contact.username.replace('.demo', '')}</span></div><div className="chat-actions"><button aria-label="Voice call" onClick={() => showToast('Οι κλήσεις δεν περιλαμβάνονται στην προσομοίωση.')}><Phone size={23}/></button><button aria-label="Video call" onClick={() => showToast('Οι κλήσεις δεν περιλαμβάνονται στην προσομοίωση.')}><Video size={25}/></button><button aria-label="Contact sources" onClick={() => openSources()}><Info size={22}/></button></div></header>
      <div className="chat-history"><div className="chat-date">Σήμερα</div>{thread.messages.map((message, index) => <div className={`message-group ${message.author}`} key={message.id}>{message.author === 'contact' && <Avatar contact={contact} size="tiny"/>}<div><div className="message-bubble">{message.text}</div>{index === thread.messages.length - 1 && <span className="bubble-time">{message.author === 'owner' ? 'Sent · ' : ''}{message.time}{message.author === 'contact' && thread.unread ? ' · New message' : ''}</span>}</div></div>)}<div ref={end}/></div>
      {composerUI()}
    </section>
  </div>;

  const gmailUI = <div className="gmail-layout">
    <header className="gmail-header"><div className="gmail-logo"><button aria-label="Gmail menu" onClick={() => showToast('Επίλεξε φάκελο από την πλαϊνή στήλη.')}><Menu size={23}/></button><GmailLogo/><span>Gmail</span></div><label className="gmail-search"><Search size={23}/><input aria-label="Search mail" placeholder="Αναζήτηση μηνυμάτων" value={search} onChange={event => { setSearch(event.target.value); setGmailView('inbox'); }}/><button aria-label="Search options" onClick={() => showToast('Αναζήτηση με όνομα, θέμα ή κείμενο μηνύματος.')}><Settings2 size={21}/></button></label><div className="gmail-header-actions"><button aria-label="Mail help" onClick={() => openSources()}><CircleHelp size={23}/></button><button aria-label="Control Center settings" onClick={() => setPanel('control')}><Settings2 size={23}/></button><button className="gmail-gemini" aria-label="AI sources" onClick={() => openSources()}><Sparkles size={24}/></button><button aria-label="Google apps" onClick={() => showToast('Instagram και Gmail είναι διαθέσιμα από την επάνω μπάρα.')}><Grid3X3 size={22}/></button><button aria-label="Google account" onClick={() => openSources()}><Avatar size="small"/></button></div></header>
    <aside className="gmail-sidebar"><button className="gmail-new" onClick={openCompose}><Pencil size={24}/><span>Σύνταξη</span></button><button className={`gmail-folder ${gmailFolder === 'inbox' ? 'active' : ''}`} onClick={() => selectFolder('inbox')}><Inbox size={18}/><span>Εισερχόμενα</span><b>{unread}</b></button><button className={`gmail-folder ${gmailFolder === 'starred' ? 'active' : ''}`} onClick={() => selectFolder('starred')}><Star size={18}/><span>Με αστέρι</span></button><button className="gmail-folder" onClick={() => showToast('Δεν υπάρχουν μηνύματα σε αναβολή.')}><Clock size={18}/><span>Σε αναβολή</span></button><button className={`gmail-folder ${gmailFolder === 'sent' ? 'active' : ''}`} onClick={() => selectFolder('sent')}><Send size={18}/><span>Απεσταλμένα</span></button><button className="gmail-folder" onClick={openCompose}><Mail size={18}/><span>Πρόχειρα</span><b>{Object.values(drafts).filter(Boolean).length || ''}</b></button><button className="gmail-folder" onClick={() => setPanel('control')}><ChevronDown size={18}/><span>Περισσότερα</span></button><div className="gmail-labels"><span>Ετικέτες</span><button aria-label="Add label" onClick={() => showToast('Οι ετικέτες είναι ενδεικτικές στο demo.')}><Plus size={19}/></button></div><span className="gmail-label"><Tag size={16}/>Πανεπιστήμιο</span><span className="gmail-label"><Tag size={16}/>Προσωπικά</span></aside>
    <section className="gmail-main"><div className="gmail-mailbox"><div className="gmail-mail-toolbar"><div>{gmailView === 'thread' ? <button aria-label="Back to inbox" onClick={() => setGmailView('inbox')}><ArrowLeft size={20}/></button> : <button aria-label="Select mail" onClick={() => showToast('Επίλεξε ένα μήνυμα για να το ανοίξεις.')}><Square size={17}/><ChevronDown size={12}/></button>}<button aria-label="Refresh mail" onClick={() => showToast('Τα εισερχόμενα είναι ενημερωμένα.')}><RefreshCw size={17}/></button><button aria-label="More mail actions" onClick={() => setPanel('control')}><MoreVertical size={19}/></button></div><span>1–{filteredThreads.length} από {filteredThreads.length}</span><button aria-label="Previous mail" onClick={() => showToast('Βρίσκεσαι στην πρώτη σελίδα.')}><ChevronLeft size={18}/></button><button aria-label="Next mail" onClick={() => showToast('Όλες οι συνομιλίες εμφανίζονται σε αυτή τη σελίδα.')}><ChevronRight size={18}/></button></div>
      {gmailView === 'inbox' ? <><div className="gmail-category-tabs"><button className="active"><Inbox size={19}/><span>{gmailFolder === 'inbox' ? 'Κύρια' : gmailFolder === 'sent' ? 'Απεσταλμένα' : 'Με αστέρι'}</span></button><button onClick={() => showToast('Δεν υπάρχουν διαφημιστικά μηνύματα στο demo.')}><Tag size={19}/><span>Προσφορές</span></button><button onClick={() => showToast('Οι συνθετικές συνομιλίες βρίσκονται στα Κύρια.')}><Users size={19}/><span>Κοινωνικά</span></button><button onClick={() => showToast('Οι συνθετικές συνομιλίες βρίσκονται στα Κύρια.')}><Info size={19}/><span>Ενημερώσεις</span></button></div><div className="gmail-inbox-list">{filteredThreads.map(item => { const person = getContact(item.contactId); return <div className={`email-row ${item.unread ? 'unread' : ''}`} key={item.id}><button className="email-checkbox" aria-label={`Select ${person.name}`} onClick={() => showToast('Πάτησε στο μήνυμα για να ανοίξεις τη συνομιλία.')}><Square size={17}/></button><button className="email-star" aria-label={`Star ${person.name}`} onClick={() => toggleStar(item.id)}><Star size={18} fill={stars.includes(item.id) ? '#f4b400' : 'none'}/></button><button className="email-select" onClick={() => selectThread(item.id)}><strong>{person.name}</strong><span><b>{item.subject}</b><span> — {item.messages.at(-1)?.text}</span></span><small>{item.messages.at(-1)?.time}</small></button></div>; })}{!filteredThreads.length && <p className="empty-state">Δεν υπάρχουν μηνύματα.</p>}</div><div className="gmail-inbox-footer"><span>Demo · Synthetic data</span><span>Όλες οι ενέργειες παραμένουν μέσα στην προσομοίωση.</span></div></> : <div className="gmail-thread"><h2>{thread.subject}<span>Εισερχόμενα</span></h2><div className="gmail-messages">{thread.messages.map(message => <article className="email-message" key={message.id}><Avatar contact={message.author === 'contact' ? contact : undefined}/><div><header><strong>{message.author === 'contact' ? contact.name : persona.name}</strong><small>&lt;{message.author === 'contact' ? contact.email : persona.email}&gt;</small><time>{message.time}</time><button aria-label="Star message" onClick={() => toggleStar(thread.id)}><Star size={16} fill={stars.includes(thread.id) ? '#f4b400' : 'none'}/></button></header><span className="email-recipient">προς {message.author === 'contact' ? 'εμένα' : contact.firstName} <ChevronDown size={11}/></span><p>{message.text}</p></div></article>)}</div>{!floatingCompose && composerUI()}<div ref={end}/></div>}
    </div></section>
    <aside className="gmail-app-rail"><button aria-label="Calendar" onClick={() => showToast('Το ημερολόγιο δεν περιλαμβάνεται στο demo.')}><Calendar size={19}/></button><button aria-label="Keep notes" onClick={() => openSources()}><Lightbulb size={19}/></button><button aria-label="Tasks" onClick={() => showToast('Οι εργασίες δεν περιλαμβάνονται στο demo.')}><CheckSquare size={19}/></button><button aria-label="Contacts" onClick={() => openSources()}><Users size={19}/></button><i/><button aria-label="Add apps" onClick={() => setPanel('control')}><Plus size={20}/></button></aside>
    {floatingCompose && <section className={`gmail-floating-compose ${composeMinimized ? 'minimized' : ''}`} aria-label="New message"><header className="floating-compose-header"><strong>Νέο μήνυμα</strong><div><button aria-label="Minimize compose" onClick={() => setComposeMinimized(value => !value)}><Minus size={15}/></button><button aria-label="Expand compose" onClick={() => setComposeMinimized(false)}><Maximize2 size={14}/></button><button aria-label="Close compose" onClick={() => setFloatingCompose(false)}><X size={16}/></button></div></header>{!composeMinimized && <><label className="floating-recipient"><span>Προς</span><select aria-label="Recipient" value={contact.id} onChange={event => { const target = threads.find(item => item.contactId === event.target.value)!; setSelected(current => ({ ...current, gmail: target.id })); }}>{contacts.filter(item => item.channel === 'gmail').map(item => <option value={item.id} key={item.id}>{item.name} &lt;{item.email}&gt;</option>)}</select><span>Κοιν. Κρυφή κοιν.</span></label><label className="floating-subject"><input aria-label="Subject" placeholder="Θέμα" value={composeSubject} onChange={event => setComposeSubject(event.target.value)}/></label>{composerUI(true)}</>}</section>}
  </div>;

  return <div className={`desktop ${channel}-desktop`}>
    <header className="workspace-bar"><div className="brand"><Sparkles size={14}/><span>Digital Self</span></div><nav className="workspace-nav" aria-label="Workspace apps"><button aria-label="Digital Twin" className={twinOpen ? 'active' : ''} onClick={() => { setTwinOpen(true); setPanel(null); }}><BrainCircuit size={15}/><span>Digital Twin</span></button><span className="nav-divider"/><button aria-label="Instagram" className={!twinOpen && channel === 'instagram' ? 'active' : ''} onClick={() => changeChannel('instagram')}><Instagram size={15}/><span>Instagram</span></button><button aria-label="Gmail" className={!twinOpen && channel === 'gmail' ? 'active' : ''} onClick={() => changeChannel('gmail')}><Mail size={15}/><span>Gmail</span></button><button aria-label="Calendar" className={panel === 'calendar' ? 'active' : ''} onClick={() => {setCalendarFocusDate(undefined);setPanel(value => value === 'calendar' ? null : 'calendar');}}><Calendar size={15}/><span>Calendar</span></button><span className="nav-divider"/><button aria-label="Control Center" className={panel === 'control' ? 'active' : ''} onClick={() => setPanel(value => value === 'control' ? null : 'control')}><Settings2 size={15}/><span>Control Center</span></button><button aria-label="Sources" className={panel === 'sources' ? 'active' : ''} onClick={() => { if (panel === 'sources') setPanel(null); else openSources(); }}><Bookmark size={15}/><span>Sources</span></button></nav><div className="workspace-meta"><AiBadge status={ai}/><span className="synthetic"><span/>Demo · Synthetic data</span><button className="reset-icon" onClick={reset} title="Reset demo" aria-label="Reset demo"><RotateCcw size={14}/></button></div></header>
    {twinOpen ? <main className="app-window twin"><TwinWorkspace/></main> : <main className={`app-window ${channel}`}>{channel === 'instagram' ? instagramUI : gmailUI}</main>}
    {panel && <div className="panel-backdrop" onClick={() => setPanel(null)}><aside ref={dialog} className={`side-panel ${panel === 'calendar' ? 'calendar-side-panel' : ''}`} role="dialog" aria-modal="true" aria-label={panel === 'control' ? 'Control Center' : panel === 'calendar' ? 'Calendar' : 'Sources'} onClick={event => event.stopPropagation()}><header className="panel-header"><div><span className="eyebrow">DIGITAL SELF</span><h2>{panel === 'control' ? 'Control Center' : panel === 'calendar' ? 'Το πρόγραμμά μου' : 'The voice behind the words'}</h2></div><button aria-label="Close panel" onClick={() => setPanel(null)}><X size={21}/></button></header>{panel === 'calendar' ? <CalendarPanel events={calendarEvents} referenceDate={referenceDate} initialViewedDate={calendarFocusDate} onDateChange={setReferenceDate} onEventsChange={setCalendarEvents}/> : panel === 'control' ? <ControlPanel channel={channel} contactId={contact.id} onInject={inject} onReset={reset}/> : <div className="sources-content"><p className="panel-description">Κάθε πρόταση βασίζεται στη σχέση με την επαφή και σε παραδείγματα του δικού σου τρόπου γραφής.</p><label className="form-label">CONTACT<select value={sourceContact.id} onChange={event => { setSourceContactId(event.target.value); setEvidence(null); }}>{contacts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.channel === 'gmail' ? 'Gmail' : 'Instagram'}</option>)}</select></label><div className="source-profile"><Avatar contact={sourceContact} size="large"/><div><h3>{sourceContact.name}</h3><p>{sourceContact.relationshipLabel}</p><small>{sourceContact.email}</small></div></div><div className="style-tags">{sourceContact.style.map(style => <span key={style}>{style}</span>)}</div><h4>Signature expressions</h4><p className="expressions">{sourceContact.expressions.map(expression => `“${expression}”`).join('  ·  ')}</p>{evidence && <div className="evidence-box"><h3><Sparkles size={17}/>Why this suggestion?</h3><p>{evidence.text}</p><AiEvidence suggestion={evidence}/>{evidence.availability && <div className="source-availability"><strong>Έλεγχος προγράμματος</strong><p>{evidence.availability.reason}</p><code>{evidence.availability.sourceIds.join(', ')}</code></div>}<div className="style-tags">{evidence.traits.map(trait => <span key={trait}>{trait}</span>)}</div><small>Based on: {evidence.sourceIds.join(', ')}</small></div>}<h4>{evidence ? 'Examples used in this suggestion' : 'Conversation sources'} <span>{evidence ? evidence.sourceIds.length : sourceRepository.getSources(sourceContact.id).length} samples</span></h4>{sourceRepository.getSources(sourceContact.id).filter(sample => !evidence || evidence.sourceIds.includes(sample.id)).map(sample => <article className="source-sample" key={sample.id}><header><code>{sample.id}</code><span>{sample.intent}</span>{evidence?.meta?.retrieval?.find(item => item.id === sample.id) && <span className="similarity" title="Cosine similarity (text-embedding-3-large)">sim {evidence.meta.retrieval.find(item => item.id === sample.id)!.score.toFixed(2)}</span>}</header><label>{sourceContact.firstName}</label><p>{sample.contactText}</p><label className="owner-source">{persona.name} <span>OWNER WRITING SAMPLE</span></label><p className="owner-example">{sample.ownerText}</p></article>)}<p className="source-note"><ShieldCheck size={15}/>Συνθετικές επαφές και παραδείγματα. Τα portraits είναι δημιουργημένα με AI.</p></div>}</aside></div>}
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
  </div>;
}
function AiBadge({ status }: { status: AiStatus }) {
  const label = status.state === 'online' ? `AI · ${status.model ?? 'online'}` : status.state === 'checking' ? 'AI · σύνδεση…' : status.paused ? 'AI · σε παύση' : 'Offline · κανόνες';
  return <span className={`ai-badge ${status.state}`} role="status" title={status.state === 'online' ? `Προτάσεις από ${status.model}${status.embeddingModel ? ` με semantic retrieval (${status.embeddingModel})` : ''}. Το API key μένει στον server.` : status.reason}><span/>{label}</span>;
}
function EngineChip({ suggestion }: { suggestion: Suggestion }) {
  const meta = suggestion.meta;
  if (!meta) return null;
  return <span className={`engine-chip ${meta.engine}`} title={meta.fallbackReason ?? (meta.understanding ? `Κατάλαβα: ${meta.understanding}` : undefined)}>{meta.engine === 'openai' ? <><Sparkles size={11}/>{meta.model}</> : <><ShieldCheck size={11}/>Κανόνες</>}</span>;
}
function AiEvidence({ suggestion }: { suggestion: Suggestion }) {
  const meta = suggestion.meta;
  if (!meta) return null;
  return <div className="ai-evidence">
    {meta.understanding && <div className="ai-understanding"><strong>Τι κατάλαβε ο ψηφιακός εαυτός</strong><p>{meta.understanding}</p></div>}
    <dl className="ai-facts">
      <div><dt>Μηχανή</dt><dd>{meta.engine === 'openai' ? `${meta.model} · semantic retrieval` : 'Deterministic κανόνες'}</dd></div>
      {meta.latencyMs !== undefined && <div><dt>Χρόνος</dt><dd>{(meta.latencyMs / 1000).toFixed(1)} s</dd></div>}
    </dl>
    {meta.fallbackReason && <p className="ai-fallback">{meta.fallbackReason}</p>}
    {meta.guard && <div className={`ai-guard ${meta.guard.passed ? 'passed' : 'failed'}`}><strong><ShieldCheck size={14}/>{meta.guard.passed ? 'Πέρασε τους ελέγχους ασφαλείας' : 'Απορρίφθηκε από τους ελέγχους ασφαλείας'}</strong><ul>{meta.guard.checks.map(check => <li key={check}>{check}</li>)}{meta.guard.issues.map(issue => <li key={issue} className="issue">{issue}</li>)}</ul></div>}
  </div>;
}
function ControlPanel({channel,contactId,onInject,onReset}:{channel:Channel;contactId:string;onInject:(c:Channel,id:string,text:string,subject:string)=>void;onReset:()=>void}) {
  const [app,setApp] = useState<Channel>(channel);
  const [sender,setSender] = useState(contactId);
  const [message,setMessage] = useState('Πάμε για καφέ τη Δευτέρα στις 10:00;');
  const [preset,setPreset] = useState('');
  const [subject,setSubject] = useState('Συνάντηση για την εργασία');
  const scenario = (relationship:Contact['relationship']) => {const contact=contacts.find(item=>item.channel===app&&item.relationship===relationship)!;const selectedPreset=demoScenarios.find(item=>item.channel===app&&item.relationship===relationship)!;setSender(contact.id);setPreset(selectedPreset.id);setMessage(selectedPreset.message);setSubject(selectedPreset.subject);};
  const submit = (e:FormEvent) => {e.preventDefault();if(message.trim())onInject(app,sender,message,subject);};
  return <div className="control-content"><p className="panel-description">Be the person on the other side. Send a message and watch the digital self adapt.</p><div className="quick-scenarios"><span className="form-label">START WITH A SCENARIO</span><div><button onClick={()=>scenario('friend')}><Smile size={18}/>A friend</button><button onClick={()=>scenario('classmate')}><Users size={18}/>A classmate</button><button onClick={()=>scenario('professor')}><Bookmark size={18}/>A professor</button></div></div><form onSubmit={submit}><label className="form-label">APPLICATION<div className="app-toggle"><button type="button" className={app==='instagram'?'active':''} onClick={()=>{setApp('instagram');setPreset('');setSender(contacts.find(c=>c.channel==='instagram')!.id);}}><Instagram size={17}/>Instagram</button><button type="button" className={app==='gmail'?'active':''} onClick={()=>{setApp('gmail');setPreset('');setSender(contacts.find(c=>c.channel==='gmail')!.id);}}><Mail size={17}/>Gmail</button></div></label><label className="form-label">DEMO SCENARIO<select value={preset} onChange={event => {const selected=demoScenarios.find(item=>item.id===event.target.value);setPreset(event.target.value);if(!selected)return;setSender(contacts.find(item=>item.channel===app&&item.relationship===selected.relationship)!.id);setMessage(selected.message);setSubject(selected.subject);}}><option value="">Επίλεξε έτοιμο παράδειγμα…</option>{demoScenarios.filter(item=>item.channel===app).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="form-label">SENDER<select value={sender} onChange={e=>setSender(e.target.value)}>{contacts.filter(c=>c.channel===app).map(c=><option key={c.id} value={c.id}>{c.name} · {c.relationshipLabel}</option>)}</select></label>{app==='gmail'&&<label className="form-label">SUBJECT<input value={subject} onChange={e=>setSubject(e.target.value)} required/></label>}<label className="form-label">INCOMING MESSAGE<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} required/></label><button className="inject-button" type="submit" disabled={!message.trim()}>Inject message <ArrowRight size={17}/></button><p className="form-note">Appears instantly in the selected inbox as unread.</p></form><div className="how-to"><h3>A one-minute test</h3><ol><li>Inject a message from a friend.</li><li>Δες την αχνή πρόταση μέσα στο πεδίο απάντησης.</li><li>Πάτησε <kbd>Tab</kbd> για αποδοχή, επεξεργάσου και στείλε.</li><li>Switch to a professor. Notice the voice change.</li><li>Type <strong>Ναι</strong> in a reply and press <kbd>Tab</kbd>.</li></ol></div><button className="reset-demo" onClick={onReset}><RotateCcw size={16}/>Reset demo</button><span className="reset-caption">Restore conversations and clear all drafts.</span></div>;
}
export default App;
