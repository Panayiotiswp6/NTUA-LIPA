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

async function openControl(user: ReturnType<typeof userEvent.setup>) {
  await user.click(workspace().getByRole('button', { name: 'Control Center' }));
  return within(screen.getByRole('dialog', { name: 'Control Center' }));
}

describe('Digital Self simulated desktop', () => {
  it('injects a custom DM, explains grounded suggestions, and sends an edited draft', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Suggest reply' }));
    const suggestion = within(await screen.findByTestId('suggestion'));
    expect(suggestion.getByText(/ωραία ιδέα για σινεμά!/)).toBeInTheDocument();
    await user.click(suggestion.getByRole('button', { name: 'Why this suggestion?' }));
    const sources = within(screen.getByRole('dialog', { name: 'Sources' }));
    expect(sources.getByText(/Based on: src-ig-maria-01/)).toBeInTheDocument();
    expect(sources.getByText('OWNER WRITING SAMPLE')).toBeInTheDocument();
    await user.click(sources.getByRole('button', { name: 'Close panel' }));
    await user.click(suggestion.getByRole('button', { name: 'Use suggestion' }));
    expect(reply()).toHaveValue('ωραία ιδέα για σινεμά! πες μου λίγες λεπτομέρειες 🙂');
    await user.clear(reply());
    await user.type(reply(), 'πες μου ποια ταινία σκέφτεσαι 🙂');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(Array.from(document.querySelectorAll('.chat-history .message-group.owner')).at(-1)).toHaveTextContent('πες μου ποια ταινία σκέφτεσαι 🙂');
    expect(reply()).toHaveValue('');
  });

  it('accepts only the autocomplete suffix with Tab and dismisses with Escape', async () => {
    const { user } = setup();
    await user.type(reply(), 'Ναι');
    const accept = await screen.findByRole('button', { name: /Accept completion/ });
    expect(accept).toBeInTheDocument();
    const suffix = document.querySelector('.completion-text')!.textContent!;
    expect(suffix).toMatch(/^,/);
    await user.keyboard('{Tab}');
    expect(reply()).toHaveValue(`Ναι${suffix}`);
    expect((reply() as HTMLTextAreaElement).value.match(/Ναι/g)).toHaveLength(1);
    await user.clear(reply());
    await user.type(reply(), 'Ναι');
    await screen.findByRole('button', { name: /Accept completion/ });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Accept completion/ })).not.toBeInTheDocument();
    expect(reply()).toHaveValue('Ναι');
    await user.keyboard('{Tab}');
    expect(reply()).not.toHaveFocus();
    expect(reply()).toHaveValue('Ναι');
  });

  it('injects Gmail to a professor and uses the formal voice with professor evidence', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Suggest reply' }));
    const suggestion = within(await screen.findByTestId('suggestion'));
    const formalText = suggestion.getByText(/^Καλησπέρα σας/).textContent!;
    expect(formalText).toContain('Θα μπορούσατε');
    expect(formalText).not.toContain('🙂');
    await user.click(suggestion.getByRole('button', { name: 'Why this suggestion?' }));
    const sources = within(screen.getByRole('dialog', { name: 'Sources' }));
    expect(sources.getByText(/Based on: src-gm-eleni-02/)).toBeInTheDocument();
    await user.click(sources.getByRole('button', { name: 'Close panel' }));
    await user.click(suggestion.getByRole('button', { name: 'Use suggestion' }));
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(document.querySelector('.gmail-messages')).toHaveTextContent(formalText);
    await user.type(reply(), 'Ναι');
    await screen.findByRole('button', { name: /Accept completion/ });
    await user.keyboard('{Tab}');
    expect((reply() as HTMLTextAreaElement).value).toContain('Ναι, σας ευχαριστώ');
  });

  it('keeps drafts and sources attached to the selected contact and application, then resets', async () => {
    const { user } = setup();
    await user.type(reply(), 'πρόχειρο φίλης');
    await user.click(screen.getByRole('button', { name: /Νίκος Παπαδάκης.*Το δεύτερο/ }));
    expect(reply()).toHaveValue('');
    expect(document.querySelector('.chat-history')).toHaveTextContent('Το δεύτερο ερώτημα, με την πολυπλοκότητα.');
    await user.type(reply(), 'πρόχειρο συμφοιτητή');
    await user.click(workspace().getByRole('button', { name: 'Sources' }));
    const sources = within(screen.getByRole('dialog', { name: 'Sources' }));
    expect(sources.getByRole('combobox', { name: 'CONTACT' })).toHaveValue('ig-nikos');
    expect(sources.getByText('src-ig-nikos-01')).toBeInTheDocument();
    await user.click(sources.getByRole('button', { name: 'Close panel' }));
    await user.click(workspace().getByRole('button', { name: 'Gmail' }));
    expect(reply()).toHaveValue('');
    await user.type(reply(), 'πρόχειρο email');
    await user.click(workspace().getByRole('button', { name: 'Instagram' }));
    expect(reply()).toHaveValue('πρόχειρο συμφοιτητή');
    await user.click(screen.getByRole('button', { name: /Μαρία Γεωργίου.*πάμε για καφέ/ }));
    expect(reply()).toHaveValue('πρόχειρο φίλης');
    await user.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(reply()).toHaveValue('');
    expect(document.querySelector('.chat-header')).toHaveTextContent('Μαρία Γεωργίου');
    await user.click(workspace().getByRole('button', { name: 'Gmail' }));
    expect(reply()).toHaveValue('');
    expect(document.querySelector('.gmail-thread h2')).toHaveTextContent('Συνάντηση για την εργασία');
  });
});
