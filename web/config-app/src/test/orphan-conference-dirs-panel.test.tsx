/**
 * The dead weight a delete leaves behind is visible, and removable.
 *
 * Deleting a conference leaves its directory unless the sysop ticks the box -
 * the messages and uploads in it are real - and nothing in the admin could
 * then SEE the leftovers. The live board carried nine, and the screen manager
 * listed them as conferences.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let orphans = [
  { dir: 'Conf9', files: 58, bytes: 364000 },
  { dir: 'Conf13', files: 45, bytes: 188000 },
];

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/conferences/orphan-directories/')) {
    orphans = orphans.filter(o => !url.endsWith(o.dir));
    return envelope({ removed: true });
  }
  if (url.includes('/conferences/orphan-directories')) {
    return envelope({ orphans, bytes: orphans.reduce((t, o) => t + o.bytes, 0) });
  }
  if (url.includes('/conferences')) {
    return envelope([{ conference_id: 1, name: 'Amiga Demoscene', location: 'BBS:Conf2/' }]);
  }
  return envelope([]);
});
vi.stubGlobal('fetch', fetchMock);

const confirmMock = vi.fn(async () => true);
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), confirm: confirmMock,
  }),
}));

import { ConferencesPage } from '../pages/ConferencesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('conference directories nothing points at', () => {
  beforeEach(() => {
    orphans = [
      { dir: 'Conf9', files: 58, bytes: 364000 },
      { dir: 'Conf13', files: 45, bytes: 188000 },
    ];
    fetchMock.mockClear();
    confirmMock.mockClear();
  });

  it('lists them with what is inside, so nobody deletes blind', async () => {
    render(<ConferencesPage />, { wrapper });

    expect(await screen.findByText(/Conf9/)).toBeTruthy();
    expect(screen.getByText(/58 files/)).toBeTruthy();
    expect(screen.getByText(/Conf13/)).toBeTruthy();
  });

  it('removes one, and asks first', async () => {
    const user = userEvent.setup();
    render(<ConferencesPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /remove Conf9/i }));

    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() => {
      const deleted = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/conferences/orphan-directories/Conf9')
        && (init as RequestInit)?.method === 'DELETE');
      expect(deleted).toBeTruthy();
    });
  });

  it('says nothing at all when the board is clean', async () => {
    orphans = [];
    render(<ConferencesPage />, { wrapper });

    await screen.findByText('Amiga Demoscene');
    expect(screen.queryByText(/no conference points at/i)).toBeNull();
  });
});
