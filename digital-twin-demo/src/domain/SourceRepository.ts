import { contacts, persona, sources, threads } from './data';
import type { Channel, SourceRepository } from './types';

/** Replace this adapter to import conversations; callers never depend on the fixture files. */
export class MockSourceRepository implements SourceRepository {
  getPersona() { return structuredClone(persona); }
  getContacts(channel?: Channel) { return structuredClone(contacts.filter(item => !channel || item.channel === channel)); }
  getContact(id: string) { return structuredClone(contacts.find(item => item.id === id)); }
  getThreads(channel?: Channel) { return structuredClone(threads.filter(item => !channel || item.channel === channel)); }
  getSources(contactId: string) { return structuredClone(sources.filter(item => item.contactId === contactId)); }
  getSource(id: string) { return structuredClone(sources.find(item => item.id === id)); }
}

export const sourceRepository: SourceRepository = new MockSourceRepository();
