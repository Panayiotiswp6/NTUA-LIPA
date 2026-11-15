import { describe, expect, it } from 'vitest';
import { MockSuggestionProvider, sourceRepository } from './index';
import { initialScheduleEvents, DEFAULT_REFERENCE_DATE } from './scheduleData';
import type { SuggestionContext } from './types';
const provider=new MockSuggestionProvider();
function context(contactId:string,text:string,draft=''):SuggestionContext {
  const contact=sourceRepository.getContact(contactId)!;
  const message={id:'schedule-test',author:'contact' as const,text,time:'09:00'};
  return {channel:contact.channel,contact,history:[message],lastIncoming:message,draft,sources:sourceRepository.getSources(contactId),calendarEvents:structuredClone(initialScheduleEvents),referenceDate:DEFAULT_REFERENCE_DATE};
}
describe('schedule-aware suggestions',()=>{
  it('rejects Monday10 coffee in the friend voice with actual school evidence',async()=>{
    const result=await provider.suggestReply(context('ig-maria','Πάμε για καφέ τη Δευτέρα στις 10:00;'));
    expect(result!.text).toContain('όχι ρε');
    expect(result!.text).toContain('Σήματα και Συστήματα (08:45–10:30)');
    expect(result!.availability?.status).toBe('conflict');
    expect(result!.availability?.sourceIds).toContain('school-signals-mon');
    expect(result!.sourceIds.every(id=>id.startsWith('src-ig-maria-'))).toBe(true);
  });
  it('uses formal language for a professor and does not invent an alternative time',async()=>{
    const result=await provider.suggestReply(context('gm-eleni','Να συναντηθούμε την Τετάρτη στις 09:30;'));
    expect(result!.text).toMatch(/^Καλησπέρα σας/);
    expect(result!.text).toContain('Σήματα και Συστήματα');
    expect(result!.text).not.toContain('🙂');
    expect(result!.text).toContain('άλλη ώρα');
  });
  it('can be available on Wednesday evening and distinguishes confirmed guitar from a tentative lab',async()=>{
    const free=await provider.suggestReply(context('ig-maria','Πάμε βόλτα την Τετάρτη στις 20:30;'));
    expect(free!.availability?.status).toBe('available');
    expect(free!.text).toContain('ελεύθερος');
    const guitar=await provider.suggestReply(context('ig-nikos','Να βρεθούμε την Τρίτη στις 16:30;'));
    expect(guitar!.availability?.status).toBe('conflict');
    expect(guitar!.text).toContain('Μάθημα κιθάρας (16:00–17:30)');
    expect(guitar!.text).not.toContain('έχω Εισαγωγικό Εργαστήριο');
  });
  it('keeps a typed prefix and the rejection reason rather than completing an incompatible acceptance',async()=>{
    const input=context('ig-maria','Πάμε για καφέ τη Δευτέρα στις 10:00;','Ναι');
    const result=await provider.autocomplete(input);
    expect(result!.text).toMatch(/^,/);
    expect(input.draft+result!.text).toContain('δεν μπορώ');
    expect(result!.availability?.status).toBe('conflict');
    input.calendarEvents=input.calendarEvents!.map(event=>event.id==='school-signals-mon'?{...event,enabled:false}:event);
    const updated=await provider.suggestReply({...input,draft:'',meetingDurationMinutes:30});
    expect(updated!.availability?.status).toBe('available');
    expect(updated!.text).toContain('ελεύθερος');
  });
  it('asks for missing scheduling details rather than promising availability',async()=>{
    const result=await provider.suggestReply(context('ig-maria','Πάμε καφέ αύριο;'));
    expect(result!.availability?.status).toBe('clarify');
    expect(result!.text).toContain('ώρα');
  });
});
