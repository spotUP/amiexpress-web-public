/**
 * Two pages, one cache key, one shape.
 *
 * The Screens workspace opens on Screen files, whose theme selector queries
 * `['screen-themes']`. The Themes page queries the SAME key with the SAME
 * fetcher but a different unwrap: the selector stored the payload, the themes
 * page stored the envelope and reads `data.data`. React Query keys the cache,
 * not the shape, so the entry held whichever the first mount wrote, and the
 * page that read it the other way got `undefined` - `canCreate` false, no New
 * theme button, no theme table.
 *
 * The same shape this repo has been bitten by before, with two `['drives']`
 * queries caching different shapes.
 *
 * The pin that matters is on the CACHE ENTRY, not on the rendered button: a
 * later mount refetches with its own fetcher and repairs the entry within a
 * tick, so a test that only clicks through the tabs passes on the broken code
 * and proves nothing. What is never repaired is the window in between - every
 * render before that refetch resolves, and any consumer that reads a cache
 * entry it did not write.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QUERY_DEFAULTS } from '../lib/query-client';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});

const index = {
  builtAt: '2026-09-07T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{ scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt', variants: ['BBSTITLE.txt'] }],
  }],
  files: { 'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt', readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }] }) },
};

const themesPayload = {
  defaultSlug: 'tango',
  canCreate: true,
  themes: [{ slug: 'tango', title: 'Tango', status: 'live', owner: 'skope', author: 'skope', dir: 'Themes/tango', widths: [80], doorTheme: '', screens: 51, exists: true, mine: false, wearable: true, writable: true, regressed: null }],
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
  if (url.includes('/config/users')) return envelope({ users: [{ username: 'sysop' }] });
  if (url.includes('/api/themes')) return envelope(themesPayload);
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index);
}));

vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'sysop' }, secLevel: 255 }) }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreensWorkspace } from '../pages/workspaces';
import { ScreenThemesPage } from '../pages/ScreenThemesPage';

/** ONE client for the whole workspace, exactly as the app has. */
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('the screens workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The APP's defaults, not a test's: at staleTime 0 a second mount
    // refetches and hides the bug this file exists for.
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('caches ONE shape under ["screen-themes"] - the envelope both readers unwrap', async () => {
    render(<ScreensWorkspace />, { wrapper });

    // The files tab is the default: its selector is what fills the entry.
    await waitFor(() => expect(screen.getByLabelText('Viewing')).toBeTruthy());
    await waitFor(() => expect(client.getQueryData(['screen-themes'])).toBeTruthy());

    // The themes page reads `data.data`. Anything else here is the entry it
    // cannot read, whatever the selector itself does with it.
    const cached = client.getQueryData(['screen-themes']) as { data?: { canCreate?: boolean } };
    expect(cached.data?.canCreate).toBe(true);
  });

  /*
   * TWO PAGES NOW, not two tabs. Themes became `/admin/themes` in S6, and
   * that makes this MORE of a risk rather than less: the two readers no
   * longer even share a mount, so nothing but the key ties them together.
   * Navigating is rendering the second page into the same client, which is
   * what the router does.
   */
  it('offers New theme after the screens page has already filled the theme cache', async () => {
    render(<ScreensWorkspace />, { wrapper });

    // Screen files is the default tab: its selector loads ['screen-themes'].
    await waitFor(() => expect(screen.getByLabelText('Viewing')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('option', { name: /Tango/ })).toBeTruthy());

    render(<ScreenThemesPage />, { wrapper });

    // The themes page must still see canCreate through the SAME cache entry.
    expect(await screen.findByRole('button', { name: /New theme/i })).toBeTruthy();
  });

  it('lists the board\'s themes, not an empty table', async () => {
    render(<ScreensWorkspace />, { wrapper });
    await waitFor(() => expect(screen.getByLabelText('Viewing')).toBeTruthy());

    render(<ScreenThemesPage />, { wrapper });

    // The title cell carries the board-default marker beside the title, so
    // the row is matched on the element's text, not on one text node.
    expect(await screen.findByText(/Tango \(board default\)/)).toBeTruthy();
  });
});
