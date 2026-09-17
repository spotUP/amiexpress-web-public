/**
 * An artist opens Screens and is in their own theme, drawing.
 *
 * They used to land on the board's own view with nine hundred files, eight
 * tabs, two "show plumbing" toggles and a theme selector listing every other
 * artist's draft - and every write they tried came back "Outside your theme".
 * The sysop: "only sysops should see files with no art in them etc".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    'Themes/skope/Board/MENU.TXT': file({ relPath: 'Themes/skope/Board/MENU.TXT', sha256: 'b', theme: 'skope', readBy: reader }),
  },
};

const themes = {
  defaultSlug: 'default',
  canCreate: false,
  themes: [{
    slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
    dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 2, exists: true,
    mine: true, wearable: true, writable: true, regressed: null,
  }],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const posts: string[] = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') !== 'GET') posts.push(`${init?.method} ${url}`);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/themes/skope/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 2, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  if (url.includes('/config/users')) return envelope({ users: [] });
  return envelope(index);
}));

let secLevel = 100;
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel }) }));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreensWorkspace } from '../pages/workspaces';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('an artist opening Screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posts.length = 0;
    secLevel = 100;
    // The APP's defaults: at staleTime 0 a page repairs cache mistakes a real
    // session would live with for five minutes.
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('lands in their own theme, not on the board', async () => {
    render(<ScreensWorkspace />, { wrapper });

    expect(await screen.findByRole('heading', { name: /skope's screens/ })).toBeTruthy();
    expect(await screen.findByText(/2 of 44 screens redrawn/)).toBeTruthy();
    // The board's own view, and the selector that reaches every other
    // artist's draft, are the sysop's.
    expect(screen.queryByLabelText('Viewing')).toBeNull();
  });

  it('is not shown the board\'s plumbing', async () => {
    render(<ScreensWorkspace />, { wrapper });
    await screen.findByRole('heading', { name: /skope's screens/ });

    for (const label of ['Themes', 'Questionnaire', 'Door screens', 'Codes', 'Duplicates', 'Read by nothing', 'Not art', 'Preview as a caller']) {
      expect(screen.queryByRole('tab', { name: new RegExp(label) })).toBeNull();
    }
    expect(screen.queryByText(/Show plumbing/)).toBeNull();
    expect(screen.queryByText(/Show art nothing reads/)).toBeNull();
    expect(screen.queryByText('Export every screen')).toBeNull();
  });

  it('sees which cards are theirs and which are still the board\'s', async () => {
    render(<ScreensWorkspace />, { wrapper });
    await screen.findByRole('heading', { name: /skope's screens/ });

    await waitFor(() => expect(screen.getByTestId('badge-mine')).toBeTruthy());
    expect(screen.getByTestId('badge-theirs')).toBeTruthy();
  });

  it('makes no theme for an artist who already owns one', async () => {
    render(<ScreensWorkspace />, { wrapper });
    await screen.findByRole('heading', { name: /skope's screens/ });

    expect(posts.filter(call => call.includes('/api/themes'))).toEqual([]);
  });

  it('gives a sysop the same one page an artist gets', async () => {
    secLevel = 255;
    render(<ScreensWorkspace />, { wrapper });

    // S9: one page for both. The strip - and the `secLevel < 255` fork that
    // sent an artist somewhere else entirely - are gone, which is what made a
    // sysop and an artist look at the same screens through two pages.
    await waitFor(() => expect(screen.queryAllByRole('tab')).toHaveLength(0));
  });
});
