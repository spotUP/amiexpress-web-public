/**
 * A PAGE THAT IS WAITING SAYS WHAT FOR, AND OFFERS A WAY OUT.
 *
 * "found it on local now its stuck loading" (sysop, 2026-09-16). Two things
 * were true at once: the backend had been restarted under him
 * (`net::ERR_EMPTY_RESPONSE`, then `ERR_CONNECTION_REFUSED`), and the first
 * request after a restart pays for the board's whole screen index - nine
 * seconds on this board. The page showed skeletons for both, for ever, with
 * nothing to press.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
vi.mock('../src/api/client', () => ({ apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { LoginSequencePage } from '../src/pages/LoginSequencePage';

const PAYLOAD = {
  node: 1,
  steps: [{
    screen: 'LOGON', label: 'Logon screen', note: '', skippedByQuickFlag: false,
    file: 'Node1/logon20.txt', exists: true, bytes: 40, blankPause: false,
    items: [{ code: 'CC', target: 'gl', pause: true }],
  }],
  available: [],
};

beforeEach(() => {
  get.mockReset();
  put.mockReset().mockResolvedValue({ data: {} });
});

describe('while the board is thinking', () => {
  it('says what the wait is, rather than showing bare skeletons', () => {
    get.mockReturnValue(new Promise(() => {}));   // never answers
    render(<LoginSequencePage />);
    expect(screen.getByText(/builds the screen index/i)).toBeTruthy();
  });

  it('offers a retry when the board does not come back', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    render(<LoginSequencePage />);

    const retry = await screen.findByRole('button', { name: /^Retry$/ });
    get.mockResolvedValue({ data: { success: true, data: PAYLOAD, timestamp: '' } });
    await userEvent.setup().click(retry);

    await waitFor(() => expect(screen.getByLabelText('Row 1 of Logon screen')).toBeTruthy());
  });

  it('says a backend that refused the connection is a backend that is down', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    render(<LoginSequencePage />);
    expect(await screen.findByText(/Network Error/)).toBeTruthy();
  });
});
