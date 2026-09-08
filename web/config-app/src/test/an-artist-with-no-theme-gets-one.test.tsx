/**
 * An artist who owns no theme is given one, without being asked.
 *
 * A theme is a copy of the board's screens, and the create route seeds it -
 * so the artist's first visit lands them in a gallery of the whole board with
 * every card ready to redraw, instead of an empty state telling them to go and
 * find the sysop. The sysop chose this over an explicit button: "he should get
 * a copy of the default template theme to work from".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});
const index = {
  builtAt: '2026-09-08T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [],
  files: { 'Screens/BULL.TXT': file({ relPath: 'Screens/BULL.TXT', sha256: 'a', readBy: [{ screen: 'BULL', scope: 'board', id: null, via: 'resolved' }] }) },
};

const theme = (over: Record<string, unknown> = {}) => ({
  slug: 'skope', title: "skope's screens", status: 'draft', owner: 'skope', author: 'skope',
  dir: 'Themes/skope', widths: [80], doorTheme: '', screens: 1, exists: true,
  mine: true, wearable: true, writable: true, regressed: null, ...over,
});

const envelope = (data: unknown, status = 200) => Promise.resolve({
  ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => (status < 400
    ? { success: true, data, timestamp: '' }
    : { success: false, error: 'There is already a theme called "skope"' }),
  text: async () => JSON.stringify({ success: status < 400, data }),
} as unknown as Response);

/** What the board answers `GET /api/themes` with, changed by the tests. */
let themesNow: ReturnType<typeof theme>[] = [];
/** How the board answers the create - 200, or the other tab's 409. */
let createAnswer: 'ok' | 'taken' = 'ok';
const creates: Array<Record<string, unknown>> = [];

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url.includes('/api/themes') && method === 'POST') {
    creates.push(JSON.parse(String(init?.body ?? '{}')));
    themesNow = [theme()];
    if (createAnswer === 'taken') return envelope(null, 409);
    return envelope({ slug: 'skope', seeded: { copied: 30, screens: 12, conflicts: [] } });
  }
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 1, total: 44 } });
  if (url.includes('/api/themes')) return envelope({ defaultSlug: 'default', canCreate: false, themes: themesNow });
  if (url.includes('/api/screens/file')) return envelope({ content: '', format: 'ansi', bytes: 0, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index);
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }) }));
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

describe('an artist with no theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creates.length = 0;
    themesNow = [];
    createAnswer = 'ok';
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('has one made for them, named after their account, without being asked', async () => {
    render(<ScreensWorkspace />, { wrapper });

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]).toMatchObject({ slug: 'skope', title: "skope's screens" });
    // Nothing was asked: no form, no dialog, no "start your theme" button.
    expect(screen.queryByRole('button', { name: /New theme|Start/i })).toBeNull();
    expect(await screen.findByRole('heading', { name: /skope's screens/ })).toBeTruthy();
  });

  it('makes exactly one, however many times the page renders', async () => {
    render(<ScreensWorkspace />, { wrapper });

    await screen.findByRole('heading', { name: /skope's screens/ });
    expect(creates).toHaveLength(1);
  });

  it('adopts the theme the other tab made, rather than making a second', async () => {
    // The other tab won the race: the board answers 409, and the list this
    // tab re-reads now holds the theme the other one made.
    createAnswer = 'taken';

    render(<ScreensWorkspace />, { wrapper });

    expect(await screen.findByRole('heading', { name: /skope's screens/ })).toBeTruthy();
    expect(creates).toHaveLength(1);
  });
});

describe('an artist who owns more than one theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creates.length = 0;
    createAnswer = 'ok';
    themesNow = [theme({ slug: 'old', title: 'Last winter' }), theme({ slug: 'new', title: 'This one' })];
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('lands on the one made last, and can reach the others', async () => {
    render(<ScreensWorkspace />, { wrapper });

    const picker = await screen.findByLabelText('Theme');
    expect((picker as HTMLSelectElement).value).toBe('new');
    expect(screen.getByRole('option', { name: 'Last winter' })).toBeTruthy();
    expect(creates).toHaveLength(0);
  });
});
