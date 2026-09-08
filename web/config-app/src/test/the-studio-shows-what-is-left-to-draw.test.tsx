/**
 * An artist can see the whole job, and start any part of it.
 *
 * The studio used to show only screens that already had art - so the ones the
 * board has no art for at all, the biggest wins, were invisible, and there was
 * no way to begin one. "elevate all needed theme screens so they are editable
 * in the studio also include a checklist that updates so artists can see their
 * progress".
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
const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});

const index = {
  builtAt: '', unused: [], bulletins: [], callersByLevel: {},
  conferences: [{ id: 1, name: 'Amiga', dir: 'Conf1' }],
  screens: [],
  files: {
    'Themes/skope/Node/BBSTITLE.TXT': file({
      relPath: 'Themes/skope/Node/BBSTITLE.TXT', sha256: 'a', theme: 'skope',
      readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 0, via: 'resolved' }],
    }),
  },
};

const themes = {
  defaultSlug: 'default', canCreate: false,
  themes: [{
    slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
    dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 1, exists: true,
    mine: true, wearable: true, writable: true, regressed: null,
  }],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const writes: Array<{ url: string; body: any }> = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') !== 'GET') writes.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
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

describe('the studio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  });

  it('says how much of the theme is drawn', async () => {
    render(<ArtistStudioPage />, { wrapper });

    expect(await screen.findByText(/\d+ of \d+ screens drawn/)).toBeTruthy();
  });

  it('offers the screens nobody has drawn yet, not just the ones with art', async () => {
    render(<ArtistStudioPage />, { wrapper });

    // PRIVATE has no art anywhere on this board; it must still be offered.
    expect(await screen.findByRole('button', { name: /PRIVATE/ })).toBeTruthy();
    expect(screen.getAllByText('Not drawn yet').length).toBeGreaterThan(5);
  });

  it('can narrow the gallery to what is left', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });
    await screen.findByRole('button', { name: /PRIVATE/ });

    await user.click(screen.getByLabelText(/Only what is still to draw/));

    await waitFor(() => expect(screen.queryByRole('button', { name: /^BBSTITLE/ })).toBeNull());
    expect(screen.getByRole('button', { name: /PRIVATE/ })).toBeTruthy();
  });

  it('opens an undrawn screen on a blank canvas, ready to save', async () => {
    const user = userEvent.setup();
    render(<ArtistStudioPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /PRIVATE/ }));

    expect(await screen.findByText(/Nothing has been drawn here yet/)).toBeTruthy();
    expect(await screen.findByText('Save')).toBeTruthy();
  });
});
