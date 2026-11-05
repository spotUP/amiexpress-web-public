/**
 * The Security page edits one level, and a caller is served by one level.
 *
 * "all users with higher security level than 30 does not have unlimited time
 * in the bbs" (sysop, 2026-09-14). ACS.OVERRIDE_TIMELIMIT was ticked on level
 * 30 and on nothing else, and express.e:3025-3035 reads exactly one ACS file -
 * the nearest at or below the caller's level - so levels 50, 60 and 255, which
 * have files of their own, never saw it. The page showed a green switch and
 * said nothing about the three levels it did not reach.
 *
 * It now names them, and grants there in one click.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const TIMELIMIT = 'ACS.OVERRIDE_TIMELIMIT';

const levelsPayload = {
  levels: [30, 50, 60, 255],
  inUse: [{ level: 30, users: 30, servedBy: 30 }],
  permissions: [TIMELIMIT, 'ACS.DOWNLOAD'],
  grants: {
    30: { [TIMELIMIT]: true, 'ACS.DOWNLOAD': true },
    50: { 'ACS.DOWNLOAD': true },
    60: { 'ACS.DOWNLOAD': true },
    255: { 'ACS.DOWNLOAD': true },
  },
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const puts: Array<{ url: string; body: unknown }> = [];

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (/\/config\/security\/levels\/\d+/.test(url)) {
    if (init?.method === 'PUT') {
      puts.push({ url, body: JSON.parse(String(init.body)) });
      return envelope({ level: 50 });
    }
    return envelope({ flags: { [TIMELIMIT]: true, 'ACS.DOWNLOAD': true }, ambiguous: [] });
  }
  return envelope(levelsPayload);
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { SecurityPage } from '../src/pages/SecurityPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('a permission granted only on the level being edited', () => {
  beforeEach(() => { fetchMock.mockClear(); puts.length = 0; });

  it('names the higher levels that do not have it', async () => {
    render(<SecurityPage />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/Not granted on level 50, 60, 255/)).toBeInTheDocument()
    );
    expect(screen.getByText(/permissions do not inherit upward/)).toBeInTheDocument();
  });

  it('grants it on each of those levels in one click', async () => {
    render(<SecurityPage />, { wrapper });

    const grant = await screen.findByRole('button', { name: /Grant on level 50, 60, 255 too/ });
    await userEvent.click(grant);

    await waitFor(() => expect(puts).toHaveLength(3));
    expect(puts.map(p => p.url.split('/').pop())).toEqual(['50', '60', '255']);
    // One flag per request: the save merges, so nothing else in those files
    // is touched by a change the sysop did not ask for.
    for (const put of puts) {
      expect(put.body).toEqual({ flags: { [TIMELIMIT]: true } });
    }
  });

  it('says only where a permission is already granted, when there is no gap', async () => {
    render(<SecurityPage />, { wrapper });

    // ACS.DOWNLOAD is on every level, so its row carries the quiet line and
    // no offer to fix anything - one warning on the page, not eighty-seven.
    const download = (await screen.findByText('ACS.DOWNLOAD')).closest('div');
    expect(download).not.toBeNull();
    expect(download!.textContent).toMatch(/Also granted on level 50, 60, 255/);
    expect(download!.textContent).not.toMatch(/Grant on level/);

    expect(screen.getAllByRole('button', { name: /Grant on level .* too/ })).toHaveLength(1);
  });
});
