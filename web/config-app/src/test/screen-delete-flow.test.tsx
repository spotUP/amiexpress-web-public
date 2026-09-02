/**
 * Deleting a screen closes the dialog and refreshes what is on screen.
 *
 * "I deleted a screen file but the dialog did not close and the gallery was
 * not refreshed."
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

let deleted = false;
let refuse = false;

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [],
  conferences: [],
  bulletins: [],
  files: deleted ? {} : {
    'Screens/DOOMED.TXT': {
      relPath: 'Screens/DOOMED.TXT', bytes: 6, format: 'ansi', sha256: 'a', mci: [],
      problems: [], readBy: [{ screen: 'LOGON', scope: 'board', id: null, via: 'resolved' }],
    },
  },
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/api/screens/file') && init?.method === 'DELETE') {
    if (refuse) {
      return Promise.resolve({
        ok: false, status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: false, error: 'Path outside the board root' }),
        text: async () => '{}',
      } as unknown as Response);
    }
    deleted = true;
    return envelope({ deleted: true, stopsResolving: [] });
  }
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ relPath: 'Screens/DOOMED.TXT', bytes: 6, format: 'ansi', mci: [], content: base64(art) });
  }
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('deleting a screen file', () => {
  beforeEach(() => { deleted = false; refuse = false; fetchMock.mockClear(); });

  it('says why, in the dialog, when the board refuses', async () => {
    // A toast is missable and then gone; the reason belongs where the button
    // was pressed. This is what "the dialog did not close" actually was.
    refuse = true;
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    expect(await within(dialog).findByText(/That did not work/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes the dialog and takes the card off the gallery', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('LOGON'));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByText('LOGON')).toBeNull());
  });
});
