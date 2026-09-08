/**
 * The board's own screens are something to draw in, not a read-only view.
 *
 * `default` was filtered out of the studio's picker because it has no
 * directory of its own, so the sysop could not edit the board's art from the
 * studio at all: "while developing amiexpress the sysop needs to be able to
 * edit the default theme as well, also tango needs to be able to do it as he
 * will make it".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  builtAt: '', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{ screen: 'BULL', dirType: 'global', missingScopes: 0, duplicateGroups: [], resolutions: [] }],
  // The BOARD's own file: no theme on it at all.
  files: { 'Screens/BULL.TXT': file({ relPath: 'Screens/BULL.TXT', sha256: 'a', readBy: reader }) },
};

const theme = (over: Record<string, unknown>) => ({
  status: 'draft', widths: [80], doorTheme: '', screens: 1, exists: true,
  wearable: true, writable: true, regressed: null, ...over,
});

const themes = {
  defaultSlug: 'default',
  canCreate: true,
  themes: [
    theme({ slug: 'default', title: "The board's own screens", owner: 'tango', author: 'tango', dir: '', mine: false, status: 'live' }),
    theme({ slug: 'neon', title: 'Neon', owner: 'skope', author: 'skope', dir: 'Themes/neon', mine: false }),
  ],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 1, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  if (url.includes('/config/users')) return envelope([]);
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
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>
);

describe('the board\'s own screens, in the studio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('are offered as something to draw in', async () => {
    render(<ArtistStudioPage />, { wrapper });

    const picker = await screen.findByLabelText('Theme');
    const offered = Array.from(picker.querySelectorAll('option')).map(o => o.textContent ?? '');

    // Red before the fix: an entry with no directory was filtered out.
    expect(offered.some(label => label.includes("The board's own screens"))).toBe(true);
  });

  it('open the board\'s file for editing, not as somebody else\'s art', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    await user.selectOptions(await screen.findByLabelText('Theme'), 'default');
    // The card, not its label text - the gallery draws the name and the
    // reader line, and both say BULL.
    const cards = await screen.findAllByRole('button');
    const card = cards.find(button => (button.textContent ?? '').includes('BULL'));
    await user.click(card!);

    // The board's own screen carries no theme, so "is this mine" cannot be a
    // slug comparison: it used to offer to copy the board's art into the board.
    await waitFor(() => expect(screen.queryByText(/Redraw this in/i)).toBeNull());
  });

  /*
   * Most boards have no `TYPE.n=default` row - this one does not, which is why
   * the picker showed the sysop nothing until the entry was synthesised. A row
   * is only needed to hand the board's art to somebody who is not a sysop.
   */
  it('are offered even when the registry has no row for them', async () => {
    const registry = themes.themes;
    themes.themes = registry.filter(
      entry => (entry as { slug?: string }).slug !== 'default',
    );

    render(<ArtistStudioPage />, { wrapper });
    const picker = await screen.findByLabelText('Theme');
    const offered = Array.from(picker.querySelectorAll('option')).map(o => o.textContent ?? '');

    expect(offered.some(label => label.includes("The board's own screens"))).toBe(true);
    themes.themes = registry;
  });

  it('show no redraw checklist for the board itself', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    await user.selectOptions(await screen.findByLabelText('Theme'), 'default');

    await waitFor(() => expect(screen.getByText(/0 of 0 screens drawn/i)).toBeTruthy());
  });
});
