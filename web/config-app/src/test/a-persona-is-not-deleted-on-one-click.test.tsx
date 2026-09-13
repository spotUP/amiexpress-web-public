/**
 * The Co-Sysop Personas page, through the board rather than around it.
 *
 * Four things were wrong at once, and every one of them is a sysop losing
 * work or being lied to:
 *  - the Trash button deleted a persona on ONE unconfirmed click;
 *  - `compose`, `describe` and `try` were raw `fetch` calls with no `res.ok`
 *    check, so a refusal was read as an answer - `alert(j.data.systemPrompt)`
 *    threw "cannot read properties of undefined" and the sysop saw nothing;
 *  - the composed prompt was shown in a browser alert, which no design
 *    system reaches and no test can read;
 *  - the trade list was a copy kept in the page while the board sent its own
 *    with every request, so a trade added to the board never appeared.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getPersonas = vi.fn();
const deletePersona = vi.fn();
const composePersona = vi.fn();

vi.mock('../api/client', () => ({
  apiClient: {
    getPersonas: (...args: unknown[]) => getPersonas(...args),
    deletePersona: (...args: unknown[]) => deletePersona(...args),
    composePersona: (...args: unknown[]) => composePersona(...args),
    savePersona: vi.fn(),
    describePersona: vi.fn(),
    tryPersona: vi.fn(),
  },
}));

const showError = vi.fn();
const showSuccess = vi.fn();
let confirmed = true;
/** Typed, so the dialog's own words can be asserted rather than guessed at. */
const confirmSpy = vi.fn(async (_options: { title: string; message: string; type?: string }) => confirmed);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError, showInfo: vi.fn(), showWarning: vi.fn(), confirm: confirmSpy }),
}));

import { CoSysopPersonasPage } from '../pages/CoSysopPersonasPage';

const directory = {
  presets: [{ slug: 'grumpy', handle: 'GRUMPY', name: 'Grumpy Sysop', blurb: 'the preset' }],
  board: [{ slug: 'skope', handle: 'SKOPE', name: 'Johan', blurb: 'pixel graphician' }],
  trades: ['Sysop', 'Swapper of the year'],
};

const envelope = (data: unknown, message?: string) =>
  Promise.resolve({ success: true, data, message, timestamp: '' });

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the co-sysop personas page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmed = true;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getPersonas.mockReturnValue(envelope(directory));
    deletePersona.mockReturnValue(envelope({ deleted: true }));
    composePersona.mockReturnValue(envelope({ systemPrompt: 'You are SKOPE.' }));
  });

  it('asks before deleting a persona, and deletes nothing when the answer is no', async () => {
    confirmed = false;
    render(<CoSysopPersonasPage />, { wrapper });

    await userEvent.click(await screen.findByLabelText('Delete SKOPE'));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy.mock.calls[0][0]).toMatchObject({ title: 'Delete this persona?', type: 'danger' });
    expect(deletePersona).not.toHaveBeenCalled();
  });

  it('deletes the persona once the sysop has said so', async () => {
    render(<CoSysopPersonasPage />, { wrapper });

    await userEvent.click(await screen.findByLabelText('Delete SKOPE'));

    await waitFor(() => expect(deletePersona).toHaveBeenCalledWith('skope'));
  });

  it('shows the composed prompt on the page, not in a browser alert', async () => {
    const alerted = vi.fn();
    vi.stubGlobal('alert', alerted);
    render(<CoSysopPersonasPage />, { wrapper });

    await userEvent.click(await screen.findByRole('button', { name: /Preview prompt/ }));

    expect(await screen.findByText('You are SKOPE.')).toBeTruthy();
    expect(alerted).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('says so when the board refuses to compose the prompt', async () => {
    composePersona.mockRejectedValue(new Error('Access token required'));
    render(<CoSysopPersonasPage />, { wrapper });

    await userEvent.click(await screen.findByRole('button', { name: /Preview prompt/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Access token required'));
  });

  it('offers the board\'s own trades, not a copy kept in the page', async () => {
    render(<CoSysopPersonasPage />, { wrapper });

    const trade = await screen.findByLabelText('Trade');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Swapper of the year' })).toBeTruthy());
    expect([...(trade as HTMLSelectElement).options].map(o => o.value))
      .toEqual(['', 'Sysop', 'Swapper of the year']);
  });
});
