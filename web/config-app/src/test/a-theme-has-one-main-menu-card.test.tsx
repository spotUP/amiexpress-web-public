/**
 * ONE "Main menu" card per theme, and replacing it writes the theme's one menu.
 *
 * h7's studio showed a main menu card per conference, per level and per screen
 * type. Identical copies across conferences folded into one card that wrote
 * one conference; conference 1's `Menu.txt` - what every caller below the
 * sysop's level was served - folded in behind the `MENU250.TXT` card, so no
 * replace ever reached it, and the artist was shown "a main menu that is not
 * his" (2026-10-02). A theme now has one menu every conference falls back to
 * (`Themes/<slug>/Conf/`), and this is its card.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = btoa(String.fromCharCode(...art));

const reader = (conf: number, over: Record<string, unknown> = {}) =>
  ({ screen: 'MENU', scope: 'conf', id: conf, scopeName: conf === 1 ? 'Amiga' : 'C64', via: 'resolved', ...over });
const file = (relPath: string, sha256: string, readBy: unknown[], over: Record<string, unknown> = {}) => ({
  relPath, bytes: 100, format: 'ansi', sha256, mci: [], problems: [], readBy, ...over,
});

const WIDE = 'Themes/skope/Conf/Menu.txt';

const index = {
  builtAt: '', unused: [], bulletins: [], callersByLevel: {},
  conferences: [{ id: 1, name: 'Amiga', dir: 'Conf1' }, { id: 2, name: 'C64', dir: 'Conf2' }],
  screens: [{
    screen: 'MENU', dirType: 'conf', missingScopes: 0, duplicateGroups: [],
    resolutions: [
      { scope: 'conf', id: 1, dir: 'Themes/skope/Conf', file: WIDE, variants: ['Menu.txt', 'MENU250.TXT', 'Menu.txt.GR'] },
      { scope: 'conf', id: 2, dir: 'Themes/skope/Conf/2', file: 'Themes/skope/Conf/2/Menu.txt', variants: ['Menu.txt'] },
    ],
  }],
  files: {
    // The theme's one menu, and the variants beside it.
    [WIDE]: file(WIDE, 'wide', [reader(1, { via: 'variant' })], { theme: 'skope' }),
    'Themes/skope/Conf/MENU250.TXT': file('Themes/skope/Conf/MENU250.TXT', 'wide-250',
      [reader(1, { securityLevel: 250, serves: '250 and above' })], { theme: 'skope' }),
    'Themes/skope/Conf/Menu.txt.GR': file('Themes/skope/Conf/Menu.txt.GR', 'wide-gr',
      [reader(1, { via: 'variant', screenType: 'GR', screenTypeName: 'Amiga Ansi' })], { theme: 'skope' }),
    // A conference that keeps its own: an override.
    'Themes/skope/Conf/2/Menu.txt': file('Themes/skope/Conf/2/Menu.txt', 'override', [reader(2)], { theme: 'skope' }),
    // The board's own menus, covered by the theme.
    'Conf1/Menu.txt': file('Conf1/Menu.txt', 'board-1', [reader(1, { via: 'shadowed', shadowedBy: 'skope' })]),
    'Conf1/MENU250.TXT': file('Conf1/MENU250.TXT', 'board-250',
      [reader(1, { via: 'shadowed', shadowedBy: 'skope', securityLevel: 250, serves: '250 and above' })]),
  },
};

const themes = {
  defaultSlug: 'default', canCreate: false,
  themes: [{
    slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
    dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 4, exists: true,
    mine: true, wearable: true, writable: true, regressed: null,
  }],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const writes: Array<{ url: string; body: { targets?: string[] } }> = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') === 'PUT') writes.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 1, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/screens/file')) return envelope({ content: base64, format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index);
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }) }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistStudioPage } from '../pages/ArtistStudioPage';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe("a theme's main menu in the studio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  });

  it('is one card, and the board menus it covers are not cards of their own', async () => {
    render(<ArtistStudioPage />, { wrapper });

    expect(await screen.findAllByRole('button', { name: /^Main menu/ })).toHaveLength(1);
    // The override still says what it is; the board's covered menus and the
    // theme's level and screen-type variants are not separate cards.
    expect(screen.getAllByRole('button', { name: /MENU - C64 - conference override/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /MENU - Amiga/ })).toBeNull();
  });

  it("replacing it writes the theme's one menu, and nothing else", async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /^Main menu/ }));
    const chooser = await screen.findByLabelText('Upload a drawing');
    await user.upload(chooser, new File([art], 'menu.ans'));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(decodeURIComponent(writes[0].url)).toContain(`path=${WIDE}`);
    expect(writes[0].body.targets).toEqual([WIDE]);
  });
});
