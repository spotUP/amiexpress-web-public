/**
 * The redraw opens the copy without waiting for a cache.
 *
 * The handler awaited three query invalidations before it navigated, and one
 * of them - `screen-index` - rebuilds every screen on the board server-side.
 * On the live board that is seconds of nothing: "when i click it i only get a
 * toast it doesnt open it for editing" (sysop, 2026-09-14).
 *
 * So the index refetch here NEVER settles, which is the same thing as slow
 * only more so. The artist must be in the editor anyway.
 *
 * The original, on a fast index:
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

import { QUERY_DEFAULTS } from '../src/lib/query-client';

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
/** Held open: the index refetch that used to block the navigation. */
let indexRefetchesAfterCopy = 0;

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url.includes('/copy') && method === 'POST') {
    copies.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    files['Themes/skope/Board/BULL.TXT'] = file({ relPath: 'Themes/skope/Board/BULL.TXT', sha256: 'b', theme: 'skope', readBy: reader });
    return envelope({
      from: 'Screens/BULL.TXT', to: 'Themes/skope/Board/BULL.TXT', target: 'Board/BULL.TXT',
      copied: [{ target: 'Board/BULL.TXT' }], kept: [],
    }, "Copied into skope's screens - 1 file, edit it in the screen editor");
  }
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 0, total: 44 } });
  if (url.includes('/api/themes')) return envelope(themes);
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  // The board index. Once the copy has happened, this is the slow one - and
  // a promise that never settles is the honest model of "slow enough that
  // the artist gave up".
  if (copies.length > 0) {
    indexRefetchesAfterCopy += 1;
    return new Promise<Response>(() => {});
  }
  return envelope(index());
}));

vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }) }));
vi.mock('../src/components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../src/components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistStudioPage } from '../src/pages/ArtistStudioPage';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

const openTheCard = async (user: ReturnType<typeof userEvent.setup>) => {
  const cards = await screen.findAllByRole('button', { name: /BULL/ });
  const drawn = cards.find(card => !card.textContent?.includes('Not drawn yet'));
  await user.click(drawn as HTMLElement);
};

describe('redrawing does not wait for the board index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copies.length = 0;
    indexRefetchesAfterCopy = 0;
    delete files['Themes/skope/Board/BULL.TXT'];
    client = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
  });

  it('opens the copy in the editor while the index is still refetching', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });
    await openTheCard(user);

    await user.click(await screen.findByRole('button', { name: /Redraw this/ }));

    // The copy happened, and the artist is in the editor - with the index
    // request still hanging, which is what used to hold the navigation.
    await waitFor(() => expect(copies).toHaveLength(1));
    expect(await screen.findByText('Save')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Redraw this/ })).toBeNull();

    // And the hanging refetch was REAL. This counter was incremented and never
    // read, so the comment above was an assumption: if the index were simply
    // never refetched after a copy, every assertion here would still pass and
    // the test would no longer be about waiting for anything.
    expect(indexRefetchesAfterCopy).toBeGreaterThan(0);
  });
});
