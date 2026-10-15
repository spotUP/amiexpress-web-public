/**
 * A level a user holds is nameable as itself.
 *
 * Reported by the sysop, 2026-09-02: "some security levels still say 20
 * instead of 30". This board's users are level 30 and there is no
 * ACS.30.info, so express.e serves them out of ACS.20.info
 * (express.e:3025 - round down to a multiple of five, then walk down). The
 * page opened that file and titled the whole screen "Level 20", which is the
 * file's number, not the level the sysop asked for.
 *
 * The heading now says which level was asked for AND which file answers it,
 * warns that the file serves other levels too, and offers to give the level a
 * file of its own.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const levelsPayload = {
  levels: [10, 20, 50, 255],
  inUse: [
    { level: 20, users: 2, servedBy: 20 },
    { level: 30, users: 30, servedBy: 20 },
  ],
  permissions: ['ACS.DOWNLOAD', 'ACS.UPLOAD'],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (/\/config\/security\/levels\/\d+/.test(url)) {
    if (init?.method === 'POST') return envelope({ level: 30, copiedFrom: 20 });
    return envelope({ flags: { 'ACS.DOWNLOAD': true }, ambiguous: [] });
  }
  return envelope(levelsPayload);
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { SecurityPage } from '../pages/SecurityPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the level the sysop asked for', () => {
  beforeEach(() => fetchMock.mockClear());

  it('keeps saying 30 after opening level 30, and names the file that answers', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Level 30\s*30 users/ }));

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('Level 30');
    expect(heading.textContent).not.toMatch(/^Level 20/);
    expect(screen.getByText(/edited through ACS\.20\.info/i)).toBeTruthy();
  });

  it('warns that the file it opened serves other levels too', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Level 30\s*30 users/ }));

    // Editing ACS.20.info changes level 20 as well - a sysop who thinks they
    // are editing "level 30" would not expect that.
    expect(await screen.findByText(/also changes level 20/i)).toBeTruthy();
  });

  it('offers the level a file of its own, and creates it from the one that serves it', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Level 30\s*30 users/ }));
    await user.click(await screen.findByRole('button', { name: /Create ACS\.30\.info from ACS\.20\.info/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/config/security/levels/30') && (init as RequestInit)?.method === 'POST');
      expect(post).toBeTruthy();
    });
  });

  it('says none of that for a level that has its own file', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Level 50' }));

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('Level 50');
    expect(screen.queryByText(/edited through/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Create ACS\.50\.info/i })).toBeNull();
  });
});
