/**
 * A sysop can stand in any artist's studio.
 *
 * Asked for on 2026-09-08: "as a sysop i need to be able to personate a
 * user/artist in the ansi studio to audit and fix issues in their themes".
 * The board already allows the writes - a sysop's `writableRoots` is the board
 * root - so what was missing was the view: the studio only ever offered the
 * themes the caller OWNED, and a sysop who owns none was told one was being
 * made for them.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});
const reader = [{ screen: 'BULL', scope: 'board', id: null, via: 'resolved' }];

const index = {
  builtAt: '2026-09-08T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{ screen: 'BULL', dirType: 'global', missingScopes: 0, duplicateGroups: [], resolutions: [] }],
  files: {
    'Screens/BULL.TXT': file({ relPath: 'Screens/BULL.TXT', sha256: 'a', readBy: reader }),
    'Themes/tango/Board/BULL.TXT': file({ relPath: 'Themes/tango/Board/BULL.TXT', sha256: 'b', theme: 'tango', readBy: reader }),
  },
};

const theme = (over: Record<string, unknown>) => ({
  status: 'draft', widths: [80], doorTheme: '', screens: 2, exists: true,
  wearable: true, writable: true, regressed: null, ...over,
});

const themes = {
  defaultSlug: 'default',
  canCreate: true,
  themes: [
    // The board's own screens: no directory, so nobody draws in it.
    theme({ slug: 'default', title: 'The board', owner: '', author: '', dir: '', mine: false }),
    theme({ slug: 'tango', title: "tango's theme", owner: 'tango', author: 'tango', dir: 'Themes/tango', mine: false }),
    theme({ slug: 'neon', title: 'Neon', owner: 'skope', author: 'skope', dir: 'Themes/neon', mine: false }),
  ],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const writes: string[] = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') !== 'GET') writes.push(`${init?.method} ${url}`);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 2, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  // Level-100 accounts: one owns a theme already, one does not.
  if (url.includes('/config/users')) return envelope([
    { username: 'tango', secLevel: 100 },
    { username: 'jucke', secLevel: 100 },
    { username: 'ordinary', secLevel: 50 },
  ]);
  return envelope(index);
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'sysop' }, secLevel: 255 }) }));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistStudioPage } from '../pages/ArtistStudioPage';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('a sysop in the artist studio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('can pick any artist theme, and is never given one of their own', async () => {
    render(<ArtistStudioPage />, { wrapper });

    const picker = await screen.findByLabelText('Theme');
    const offered = Array.from(picker.querySelectorAll('option')).map(option => option.textContent ?? '');
    // Whose theme each one is, so a sysop picks the right studio to stand in.
    expect(offered.some(label => label.includes("tango's theme") && label.includes('tango'))).toBe(true);
    expect(offered.some(label => label.includes('Neon'))).toBe(true);
    // The board's own screens are not a theme anybody draws in.
    expect(offered.some(label => label.includes('The board'))).toBe(false);
    // No theme is minted for a sysop who owns none.
    expect(writes.filter(write => write.includes('/api/themes'))).toEqual([]);
  });

  it('says whose work it is showing, and does not offer their move', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    await user.selectOptions(await screen.findByLabelText('Theme'), 'tango');

    const banner = await screen.findByTestId('auditing-banner');
    expect(banner.textContent).toContain('tango');
    // Sending a draft to the sysop is the ARTIST's move; a sysop publishes
    // from the Themes tab.
    expect(screen.queryByRole('button', { name: /send for review/i })).toBeNull();
    expect(screen.getByRole('button', { name: /check/i })).toBeTruthy();
  });

  /*
   * A theme is made the first time an account opens the studio, so an artist
   * who never has cannot be audited: "i can't impersonate jucke for example
   * there are no themes for him". The sysop can start one for them.
   */
  it('offers to start a theme for a level-100 account that has none', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    const picker = await screen.findByLabelText('Artist with no theme');
    const offered = Array.from(picker.querySelectorAll('option')).map(o => o.textContent);

    // tango owns one already; jucke does not; a level-50 caller is not an artist.
    expect(offered).toContain('jucke');
    expect(offered).not.toContain('tango');
    expect(offered).not.toContain('ordinary');

    await user.selectOptions(picker, 'jucke');

    await waitFor(() => expect(
      writes.some(write => write.startsWith('POST') && write.includes('/api/themes')),
    ).toBe(true));
  });

  it('draws that artist gallery, not the board own', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    await user.selectOptions(await screen.findByLabelText('Theme'), 'tango');

    // Their art is theirs: a sysop auditing is not told the work is "Yours".
    await waitFor(() => expect(screen.getByTestId('badge-mine').textContent).toContain('Redrawn by tango'));
  });
});
