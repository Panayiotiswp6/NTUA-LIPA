import { describe, expect, it } from 'vitest';
import { detectIntent, MockSuggestionProvider, MockSourceRepository } from './index';
import type { SuggestionContext } from './types';

const repository = new MockSourceRepository();
const provider = new MockSuggestionProvider();

function context(id: string, incoming: string, draft = ''): SuggestionContext {
  const contact = repository.getContact(id)!;
  const message = { id: 'test-incoming', author: 'contact' as const, text: incoming, time: '12:00' };
  return { channel: contact.channel, contact, history: [message], lastIncoming: message, draft, sources: repository.getSources(id) };
}

describe('synthetic repository', () => {
  it('has three people per application, local avatars, stable IDs and example.com addresses', () => {
    for (const channel of ['instagram', 'gmail'] as const) {
      const contacts = repository.getContacts(channel);
      expect(contacts).toHaveLength(3);
      expect(new Set(contacts.map(contact => contact.relationship)).size).toBe(3);
      for (const contact of contacts) {
        expect(contact.email).toMatch(/@example\.com$/);
        expect(contact.avatar).toMatch(/^avatars\/.+\.(svg|png)$/);
        expect(contact.avatarPosition).toMatch(/^\d+% \d+%$/);
        expect(repository.getSources(contact.id).length).toBeGreaterThan(0);
        expect(repository.getThreads(channel).some(thread => thread.contactId === contact.id)).toBe(true);
      }
    }
    const sources = repository.getContacts().flatMap(contact => repository.getSources(contact.id));
    expect(new Set(sources.map(source => source.id)).size).toBe(sources.length);
  });

  it('returns fresh fixture copies so sending or reset cannot mutate the initial state', () => {
    const first = repository.getThreads();
    first[0].messages[0].text = 'mutated';
    first[0].messages.push({ id: 'new', author: 'owner', text: 'new', time: 'now' });
    expect(repository.getThreads()[0].messages).not.toEqual(first[0].messages);
    const contact = repository.getContacts()[0];
    contact.style.push('mutated');
    expect(repository.getContact(contact.id)!.style).not.toContain('mutated');
  });
});

describe('rule-based suggestion provider', () => {
  it('recognizes the supported intents with Greek case and accents', () => {
    expect(detectIntent('Πάμε για ΚΑΦΈ;')).toBe('invitation');
    expect(detectIntent('Να συναντηθούμε;')).toBe('meeting');
    expect(detectIntent('Μια ερώτηση για την εργασία')).toBe('assignment');
    expect(detectIntent('Σου έστειλα την ενημέρωση')).toBe('confirmation');
    expect(detectIntent('Πώς είναι ο καιρός;')).toBe('unknown');
  });

  it('changes content for the same sender and tone for the same request across relationships', async () => {
    const coffee = await provider.suggestReply(context('ig-maria', 'Πάμε για καφέ;'));
    const cinema = await provider.suggestReply(context('ig-maria', 'Πάμε σινεμά;'));
    const task = await provider.suggestReply(context('ig-maria', 'Έχω απορία για την εργασία.'));
    const professor = await provider.suggestReply(context('gm-eleni', 'Πάμε για καφέ;'));
    expect(coffee!.text).toContain('καφέ');
    expect(cinema!.text).toContain('σινεμά');
    expect(task!.text).toContain('εργασία');
    expect(coffee!.text).not.toBe(task!.text);
    expect(coffee!.text).toContain('🙂');
    expect(professor!.text).toContain('Καλησπέρα σας');
    expect(professor!.text).not.toContain('🙂');
    expect(professor!.text).not.toMatch(/\d{1,2}[:.]\d{2}|θα ειμαι|θα είμαι/);
  });

  it('returns evidence IDs from exactly the active profile and relevant intent', async () => {
    const input = context('gm-eleni', 'Θα μπορούσαμε να συναντηθούμε;');
    input.sources.push(...repository.getSources('ig-maria'));
    const result = await provider.suggestReply(input);
    expect(result!.sourceIds.length).toBeGreaterThan(0);
    for (const id of result!.sourceIds) {
      const source = repository.getSource(id)!;
      expect(source.contactId).toBe('gm-eleni');
      expect(source.channel).toBe('gmail');
      expect(source.intent).toBe('meeting');
    }
    expect(result!.traits).toContain('ευγενικός πληθυντικός');
  });

  it('uses the thread only for an explicit follow-up and stays neutral for unknown topics', async () => {
    const input = context('ig-nikos', 'Το δεύτερο ερώτημα.');
    input.history.unshift({ id: 'old', author: 'contact', text: 'Για την εργασία', time: '11:00' });
    expect((await provider.suggestReply(input))!.intent).toBe('assignment');
    const unrelated = context('ig-nikos', 'Πώς είναι ο καιρός;');
    unrelated.history.unshift({ id: 'old', author: 'contact', text: 'Για την εργασία', time: '11:00' });
    expect((await provider.suggestReply(unrelated))!.intent).toBe('unknown');
    expect((await provider.suggestReply(unrelated))!.text).toContain('λεπτομέρειες');
    unrelated.draft = 'Ναι';
    expect(await provider.autocomplete(unrelated)).toBeNull();
  });

  it('returns only an appendable suffix and rejects incompatible or empty drafts', async () => {
    const input = context('ig-maria', 'Πάμε για καφέ;', 'Ναι');
    const suffix = await provider.autocomplete(input);
    expect(suffix!.text).toMatch(/^,/);
    expect(input.draft + suffix!.text).toMatch(/^Ναι, το είδα!/);
    expect(suffix!.sourceIds.every(id => id.startsWith('src-ig-maria-'))).toBe(true);
    input.draft = 'Ναι, ';
    const spaced = await provider.autocomplete(input);
    expect(input.draft + spaced!.text).toMatch(/^Ναι, το είδα!/);
    input.draft = 'Αυτό δεν ταιριάζει πουθενά';
    expect(await provider.autocomplete(input)).toBeNull();
    input.draft = '';
    expect(await provider.autocomplete(input)).toBeNull();
    const professor = await provider.autocomplete(context('gm-eleni', 'Να συναντηθούμε;', 'Ναι'));
    expect(professor!.text).toContain('σας ευχαριστώ');
    expect(professor!.text).not.toContain('🙂');
  });

  it('has no suggestion without an incoming message', async () => {
    const input = context('ig-maria', '');
    expect(await provider.suggestReply(input)).toBeNull();
    expect(await provider.autocomplete({ ...input, draft: 'Ναι' })).toBeNull();
  });

  it('continues common partial Greek openings without changing what the writer typed', async () => {
    for (const draft of ['Τέλ', 'Ωραία', 'Οκ, ', 'Ευχαρ', 'Μπορείς', 'πες μου']) {
      const result = await provider.autocomplete(context('ig-maria', 'Πάμε για καφέ;', draft));
      expect(result?.text.trim().length).toBeGreaterThan(0);
      expect(result!.sourceIds).toContain('src-ig-maria-01');
      expect((draft + result!.text).slice(0, draft.length)).toBe(draft);
    }
    const formal = await provider.autocomplete(context('gm-eleni', 'Να συναντηθούμε;', 'Καλησ'));
    expect(formal!.text).toContain('σας');
    expect(formal!.text).not.toContain('🙂');
  });
});
