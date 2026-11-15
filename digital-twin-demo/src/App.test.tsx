// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import App from './App';

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
});
afterEach(cleanup);

const setup = () => ({ user: userEvent.setup(), ...render(<App />) });
const reply = () => screen.getByRole('textbox', { name: 'Reply message' });
const workspace = () => within(screen.getByRole('navigation', { name: 'Workspace apps' }));
const ghost = () => screen.getByTestId('ghost-suggestion');
const composerValue = () => (reply() as HTMLTextAreaElement).value;
async function visibleGhost() {
  await waitFor(() => expect(ghost().textContent?.trim()).toBeTruthy());
  return ghost().textContent!;
}
async function openControl(user: ReturnType<typeof userEvent.setup>) {
  await user.click(workspace().getByRole('button', { name: 'Control Center' }));
  return within(screen.getByRole('dialog', { name: 'Control Center' }));
}
async function openProfessorMail(user: ReturnType<typeof userEvent.setup>) {
  await user.click(workspace().getByRole('button', { name: 'Gmail' }));
  await user.click(screen.getByRole('button', { name: /Ελένη Αντωνίου.*Συνάντηση για την εργασία/ }));
}

describe('Digital Self native simulated desktop', () => {
  it('shows a full automatic reply as ghost text without prefilling the actual textarea', async () => {
    const { user } = setup();
    const proposed = await visibleGhost();
    expect(proposed).toContain('καφέ');
    expect(composerValue()).toBe('');
    expect(screen.queryByRole('button', { name: /^Send$/ })).not.toBeInTheDocument();
    await user.click(reply());
    await user.keyboard('{Tab}');
    expect(composerValue()).toBe(proposed);
    expect(screen.getByRole('button', { name: /^Send$/ })).toBeEnabled();
  });

  it('injects a custom DM, explains the ghost sources, and sends an edited explicit acceptance', async () => {
    const { user } = setup();
    const control = await openControl(user);
    await user.click(control.getByRole('button', { name: 'A friend' }));
    const incoming = control.getByRole('textbox', { name: 'INCOMING MESSAGE' });
    await user.clear(incoming);
    await user.type(incoming, 'Θες να πάμε σινεμά μετά τη σχολή;');
    await user.click(control.getByRole('button', { name: 'Inject message' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.chat-history')).toHaveTextContent('Θες να πάμε σινεμά μετά τη σχολή;');
    expect(document.querySelector('.conversation-row.active .unread-dot')).toBeInTheDocument();
    const proposed = await visibleGhost();
    expect(proposed).toContain('σινεμά');
    expect(composerValue()).toBe('');
    await user.click(screen.getByRole('button', { name: 'Why this suggestion?' }));
    const sources = within(screen.getByRole('dialog', { name: 'Sources' }));
    expect(sources.getByText(/Based on: src-ig-maria-01/)).toBeInTheDocument();
    expect(sources.getByText('OWNER WRITING SAMPLE')).toBeInTheDocument();
    await user.click(sources.getByRole('button', { name: 'Close panel' }));
    await user.click(screen.getByRole('button', { name: 'Accept completion' }));
    expect(composerValue()).toBe(proposed);
    await user.clear(reply());
    await user.type(reply(), 'πες μου ποια ταινία σκέφτεσαι 🙂');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(Array.from(document.querySelectorAll('.chat-history .message-group.owner')).at(-1)).toHaveTextContent('πες μου ποια ταινία σκέφτεσαι 🙂');
    expect(composerValue()).toBe('');
  });

  it('keeps typed text unchanged until Tab appends only the suffix and Escape restores normal Tab', async () => {
    const { user } = setup();
    await user.type(reply(), 'Ναι');
    const suffix = await visibleGhost();
    expect(suffix).toMatch(/^,/);
    expect(composerValue()).toBe('Ναι');
    await user.keyboard('{Tab}');
    expect(composerValue()).toBe(`Ναι${suffix}`);
    expect(composerValue().match(/Ναι/g)).toHaveLength(1);
    await user.clear(reply());
    await user.type(reply(), 'Ναι');
    await visibleGhost();
    await user.keyboard('{Escape}');
    expect(ghost()).toHaveTextContent('');
    expect(screen.queryByRole('button', { name: 'Accept completion' })).not.toBeInTheDocument();
    expect(composerValue()).toBe('Ναι');
    await user.keyboard('{Tab}');
    expect(reply()).not.toHaveFocus();
    expect(composerValue()).toBe('Ναι');
  });

  it('injects Gmail to a professor with formal ghost text and professor evidence', async () => {
    const { user } = setup();
    const control = await openControl(user);
    await user.click(control.getByRole('button', { name: /^Gmail$/ }));
    await user.click(control.getByRole('button', { name: 'A professor' }));
    const message = control.getByRole('textbox', { name: 'INCOMING MESSAGE' });
    await user.clear(message);
    await user.type(message, 'Θα μπορούσαμε να συναντηθούμε για μια συζήτηση;');
    const subject = control.getByRole('textbox', { name: 'SUBJECT' });
    await user.clear(subject);
    await user.type(subject, 'Δοκιμή καθηγήτριας');
    await user.click(control.getByRole('button', { name: 'Inject message' }));
    expect(document.querySelector('.gmail-thread h2')).toHaveTextContent('Δοκιμή καθηγήτριας');
    expect(document.querySelector('.gmail-thread .email-message')).toHaveTextContent('eleni.antoniou@example.com');
    const formal = await visibleGhost();
    expect(formal).toMatch(/^Καλησπέρα σας/);
    expect(formal).toContain('Θα μπορούσατε');
    expect(formal).not.toContain('🙂');
    expect(composerValue()).toBe('');
    await user.click(screen.getByRole('button', { name: 'Why this suggestion?' }));
    const sources = within(screen.getByRole('dialog', { name: 'Sources' }));
    expect(sources.getByText(/Based on: src-gm-eleni-02/)).toBeInTheDocument();
    await user.click(sources.getByRole('button', { name: 'Close panel' }));
    await user.click(screen.getByRole('button', { name: 'Accept completion' }));
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(document.querySelector('.gmail-messages')).toHaveTextContent(formal);
    await user.type(reply(), 'Ναι');
    await visibleGhost();
    expect(composerValue()).toBe('Ναι');
    await user.keyboard('{Tab}');
    expect(composerValue()).toContain('Ναι, σας ευχαριστώ');
  });

  it('opens native Gmail compose, changes recipient, preserves the minimized draft and sends inside the demo', async () => {
    const { user } = setup();
    await user.click(workspace().getByRole('button', { name: 'Gmail' }));
    expect(screen.queryByRole('textbox', { name: 'Reply message' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Σύνταξη' }));
    const compose = within(screen.getByRole('region', { name: 'New message' }));
    await user.selectOptions(compose.getByRole('combobox', { name: 'Recipient' }), 'gm-nikos');
    await user.type(compose.getByRole('textbox', { name: 'Subject' }), 'Συνθετικό νέο θέμα');
    await user.type(compose.getByRole('textbox', { name: 'Reply message' }), 'Ποιο σημείο θέλεις να συζητήσουμε;');
    await user.click(compose.getByRole('button', { name: 'Minimize compose' }));
    expect(compose.queryByRole('textbox', { name: 'Reply message' })).not.toBeInTheDocument();
    await user.click(compose.getByRole('button', { name: 'Expand compose' }));
    expect(compose.getByRole('textbox', { name: 'Reply message' })).toHaveValue('Ποιο σημείο θέλεις να συζητήσουμε;');
    await user.click(compose.getByRole('button', { name: /^Send$/ }));
    expect(screen.queryByRole('region', { name: 'New message' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Νίκος Παπαδάκης.*Συνθετικό νέο θέμα/ }));
    expect(document.querySelector('.gmail-thread h2')).toHaveTextContent('Συνθετικό νέο θέμα');
    expect(document.querySelector('.gmail-messages')).toHaveTextContent('Ποιο σημείο θέλεις να συζητήσουμε;');
  });

  it('keeps drafts and sources attached to the contact and app while native Gmail opens its inbox', async () => {
    const { user } = setup();
    await user.type(reply(), 'πρόχειρο φίλης');
    await user.click(screen.getByRole('button', { name: /Νίκος Παπαδάκης.*Το δεύτερο/ }));
    expect(composerValue()).toBe('');
    expect(document.querySelector('.chat-history')).toHaveTextContent('Το δεύτερο ερώτημα, με την πολυπλοκότητα.');
    await user.type(reply(), 'πρόχειρο συμφοιτητή');
    await user.click(workspace().getByRole('button', { name: 'Sources' }));
    const sources = within(screen.getByRole('dialog', { name: 'Sources' }));
    expect(sources.getByRole('combobox', { name: 'CONTACT' })).toHaveValue('ig-nikos');
    expect(sources.getByText('src-ig-nikos-01')).toBeInTheDocument();
    await user.click(sources.getByRole('button', { name: 'Close panel' }));
    await openProfessorMail(user);
    expect(composerValue()).toBe('');
    await user.type(reply(), 'πρόχειρο email');
    await user.click(workspace().getByRole('button', { name: 'Instagram' }));
    expect(composerValue()).toBe('πρόχειρο συμφοιτητή');
    await user.click(screen.getByRole('button', { name: /Μαρία Γεωργίου.*πάμε για καφέ/ }));
    expect(composerValue()).toBe('πρόχειρο φίλης');
    await user.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(composerValue()).toBe('');
    expect(document.querySelector('.chat-header')).toHaveTextContent('Μαρία Γεωργίου');
    await openProfessorMail(user);
    expect(composerValue()).toBe('');
    expect(document.querySelector('.gmail-thread h2')).toHaveTextContent('Συνάντηση για την εργασία');
  });
});
