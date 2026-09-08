/**
 * The board's screen, and the one way an artist may change it.
 *
 * An artist owns a theme and writes inside it and nowhere else. Opening the
 * board's own art used to hand them every tool, take the drawing and answer
 * "Outside your theme: Screens/BULL.TXT" at Save. Now it opens read-only with
 * one button, which copies the screen into their theme - the security variants
 * and the .seq/.rip twins with it - and reopens on the copy, editable.
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

/** The board's own bulletin; the theme has nothing yet. */
const files: Record<string, ReturnType<typeof file>> = {
  'Screens/BULL.TXT': file({ relPath: 'Screens/BULL.TXT', sha256: 'a', readBy: reader }),
};
const index = () => ({
  builtAt: '2026-09-08T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [], files,
});

const themes = {
  defaultSlug: 'default', canCreate: false,
  themes: [{
    slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
    dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 0, exists: true,
    mine: true, wearable: true, writable: true, regressed: null,
  }],
};

const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const copies: Array<{ url: string; body: unknown }> = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url.includes('/copy') && method === 'POST') {
    copies.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    // What the route answers: the whole screen landed, and `to` is the copy of
    // the file the artist actually asked for.
    files['Themes/skope/Board/BULL.TXT'] = file({ relPath: 'Themes/skope/Board/BULL.TXT', sha256: 'b', theme: 'skope', readBy: reader });
    files['Themes/skope/Board/BULL255.TXT'] = file({ relPath: 'Themes/skope/Board/BULL255.TXT', sha256: 'c', theme: 'skope', readBy: reader });
    return envelope({
      from: 'Screens/BULL.TXT',
      to: 'Themes/skope/Board/BULL.TXT',
      target: 'Board/BULL.TXT',
      copied: [{ target: 'Board/BULL.TXT' }, { target: 'Board/BULL255.TXT' }],
      kept: [],
    }, "Copied into skope's screens - 2 files, edit it in the screen editor");
  }
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 0, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index());
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }) }));
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

const openTheCard = async (user: ReturnType<typeof userEvent.setup>) => {
  // The studio also offers every screen the theme has NOT drawn, so several
  // cards carry this name. The one with art is the one without the badge.
  const cards = await screen.findAllByRole('button', { name: /BULL/ });
  const drawn = cards.find(card => !card.textContent?.includes('Not drawn yet'));
  await user.click(drawn as HTMLElement);
};

describe('a board screen an artist has not redrawn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copies.length = 0;
    for (const key of Object.keys(files)) if (key.startsWith('Themes/')) delete files[key];
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('opens read-only, with one way to make it mine', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });
    await openTheCard(user);

    expect(await screen.findByRole('button', { name: /Redraw this in skope's screens/ })).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Insert a code')).toBeNull();
  });

  it('redrawing copies the screen into my theme and opens the copy', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });
    await openTheCard(user);

    await user.click(await screen.findByRole('button', { name: /Redraw this/ }));

    await waitFor(() => expect(copies).toHaveLength(1));
    expect(copies[0].url).toContain('/api/themes/skope/copy');
    expect(copies[0].body).toEqual({ path: 'Screens/BULL.TXT' });
    // The dialog moved to the copy, and the copy is the artist's to draw in.
    expect(await screen.findByText('Save')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Redraw this/ })).toBeNull();
  });
});
