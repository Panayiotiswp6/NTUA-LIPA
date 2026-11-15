// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import App from './App';

beforeEach(() => { Object.defineProperty(Element.prototype, 'scrollIntoView', {configurable:true,value:()=>undefined}); });
afterEach(cleanup);
const navigation = () => within(screen.getByRole('navigation', {name:'Workspace apps'}));
const ghost = () => screen.getByTestId('ghost-suggestion');
const waitGhost = async (pattern: RegExp) => { await waitFor(()=>expect(ghost()).toHaveTextContent(pattern)); };

describe('calendar-aware simulated desktop', () => {
  it('explains the Monday coffee rejection with the exact school event and keeps the draft empty', async () => {
    const user=userEvent.setup();render(<App/>);
    await waitGhost(/Σήματα και Συστήματα/);
    expect(screen.getByRole('textbox',{name:'Reply message'})).toHaveValue('');
    await user.click(screen.getByRole('button',{name:'Why this availability?'}));
    const explanation=within(screen.getByRole('dialog',{name:'Availability explanation'}));
    expect(explanation.getAllByText(/08:45–10:30/).length).toBeGreaterThan(0);
    expect(explanation.getByText(/school-signals-mon/)).toBeInTheDocument();
    await user.click(explanation.getByRole('button',{name:/Προβολή ημερολογίου/}));
    const calendar=within(screen.getByRole('dialog',{name:'Calendar'}));
    expect(calendar.getByLabelText('Calendar reference date')).toHaveValue('2026-11-16');
    expect(calendar.getByLabelText('Calendar viewed date')).toHaveValue('2026-11-16');
    fireEvent.change(calendar.getByLabelText('Calendar viewed date'),{target:{value:'2026-11-17'}});
    expect(calendar.getByLabelText('Calendar viewed date')).toHaveValue('2026-11-17');
    expect(calendar.getByLabelText('Calendar reference date')).toHaveValue('2026-11-16');
  });

  it('recalculates an available invitation when a dated extra is added and removed without changing simulated today', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(navigation().getByRole('button',{name:'Control Center'}));
    let panel=within(screen.getByRole('dialog',{name:'Control Center'}));
    expect(panel.getByRole('combobox',{name:'DEMO SCENARIO'}).querySelectorAll('option')).toHaveLength(12);
    await user.selectOptions(panel.getByRole('combobox',{name:'DEMO SCENARIO'}),'ig-wednesday-evening-free');
    await user.click(panel.getByRole('button',{name:'Inject message'}));
    await waitGhost(/ελεύθερος/);
    await user.click(navigation().getByRole('button',{name:'Calendar'}));
    panel=within(screen.getByRole('dialog',{name:'Calendar'}));
    await user.type(panel.getByLabelText('Extra event title'),'Συνάντηση ομάδας hackathon');
    fireEvent.change(panel.getByLabelText('Extra event date'),{target:{value:'2026-11-18'}});
    fireEvent.change(panel.getByLabelText('Extra event start'),{target:{value:'20:00'}});
    fireEvent.change(panel.getByLabelText('Extra event end'),{target:{value:'21:30'}});
    await user.click(panel.getByRole('button',{name:'Προσθήκη στο ημερολόγιο'}));
    expect(panel.getByLabelText('Calendar reference date')).toHaveValue('2026-11-16');
    expect(panel.getByLabelText('Calendar viewed date')).toHaveValue('2026-11-18');
    await user.click(panel.getByRole('button',{name:'Close panel'}));
    await waitGhost(/δεν μπορώ.*Συνάντηση ομάδας hackathon/);
    await user.click(navigation().getByRole('button',{name:'Calendar'}));
    panel=within(screen.getByRole('dialog',{name:'Calendar'}));
    fireEvent.change(panel.getByLabelText('Calendar viewed date'),{target:{value:'2026-11-18'}});
    await user.click(panel.getByRole('button',{name:'Delete Συνάντηση ομάδας hackathon'}));
    await user.click(panel.getByRole('button',{name:'Close panel'}));
    await waitGhost(/ελεύθερος/);
  });

  it('uses the professor voice and calendar evidence for a Gmail meeting request', async () => {
    const user=userEvent.setup();render(<App/>);
    await user.click(navigation().getByRole('button',{name:'Gmail'}));
    await user.click(screen.getByRole('button',{name:/Ελένη Αντωνίου.*Συνάντηση για την εργασία/}));
    await waitGhost(/^Καλησπέρα σας.*Σήματα και Συστήματα/);
    expect(ghost()).toHaveTextContent(/08:45–10:30/);
    expect(ghost()).not.toHaveTextContent('🙂');
    await user.click(screen.getByRole('button',{name:'Why this availability?'}));
    expect(within(screen.getByRole('dialog',{name:'Availability explanation'})).getByText(/school-signals-wed/)).toBeInTheDocument();
  });
});
