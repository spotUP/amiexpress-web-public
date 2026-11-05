/**
 * What an artist can do with their theme, without a Themes tab.
 *
 * The studio is one gallery, so the theme's own state and its three actions
 * live above it: how much of the board is redrawn, a check, a preview, and
 * handing it to the sysop. Publishing is NOT among them - the server refuses
 * it for a non-sysop, and a button that always fails is worse than none.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../src/lib/query-client';

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const writes: Array<{ method: string; url: string; body: unknown }> = [];
const report = {
  blocking: [{ rule: 'shadows-security-variant', severity: 'blocking', file: 'Board/BULL.TXT', message: 'This covers the sysop bulletin' }],
  advisory: [],
  publishable: false,
  coverage: { provided: 7, total: 44 },
};

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (method !== 'GET') writes.push({ method, url, body: JSON.parse(String(init?.body ?? '{}')) });
  if (url.includes('/validation')) return envelope(report);
  return envelope({});
}));

vi.mock('../src/components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => <div>the preview</div> }));
const showSuccess = vi.fn();
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ThemeStatusBar } from '../src/pages/ThemeStatusBar';
import type { ArtistTheme } from '../src/pages/use-my-theme';

const theme = (over: Partial<ArtistTheme> = {}): ArtistTheme => ({
  slug: 'skope', title: "skope's screens", status: 'draft', dir: 'Themes/skope',
  owner: 'skope', screens: 7, mine: true, ...over,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const bar = (over: Partial<ArtistTheme> = {}, choices?: ArtistTheme[]) => (
  <ThemeStatusBar
    theme={theme(over)}
    choices={choices ?? [theme(over)]}
    onSelect={vi.fn()}
    screenNames={['BULL']}
    auditing={over.mine === false}
  />
);

describe('an artist\'s theme, above the gallery', () => {
  beforeEach(() => { vi.clearAllMocks(); writes.length = 0; });

  it('says how much of the board is redrawn', async () => {
    render(bar(), { wrapper });

    expect(await screen.findByText('7 of 44 screens redrawn')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('shows the server\'s own report when asked to check', async () => {
    const user = userEvent.setup();
    render(bar(), { wrapper });

    await user.click(screen.getByRole('button', { name: /Check/ }));

    expect(await screen.findByTestId('theme-validation')).toBeTruthy();
    expect(screen.getByText(/covers the sysop bulletin/)).toBeTruthy();
  });

  it('hands a draft to the sysop, and never offers to publish it', async () => {
    const user = userEvent.setup();
    render(bar(), { wrapper });

    await user.click(screen.getByRole('button', { name: /Send for review/ }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe('PUT');
    expect(writes[0].url).toContain('/api/themes/skope');
    expect(writes[0].body).toEqual({ status: 'review' });

    for (const forbidden of [/Publish/i, /Make live/i, /board default/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).toBeNull();
    }
  });

  it('does not ask again for a theme already with the sysop', () => {
    render(bar({ status: 'review' }), { wrapper });

    expect(screen.getByText('In review')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Send for review/ })).toBeNull();
  });

  it('offers a switcher only to an artist who owns more than one', () => {
    const { unmount } = render(bar(), { wrapper });
    expect(screen.queryByLabelText('Theme')).toBeNull();
    unmount();

    render(bar({}, [theme(), theme({ slug: 'other', title: 'The other one' })]), { wrapper });
    expect(screen.getByLabelText('Theme')).toBeTruthy();
  });

  // `default` is the board's own screens, not a registry theme: asking the
  // server to validate it answers 404, twice (query plus retry) straight
  // onto the artist's console. The bar asks nothing of it.
  it('never asks validation of the board default', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const seen: string[] = [];
    const outer = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      return outer!(input, init);
    });
    try {
      render(bar({ slug: 'default', title: 'Board default' }), { wrapper });

      await waitFor(() => expect(screen.getByText(/Counting what you have redrawn/)).toBeTruthy());
      expect(seen.some(url => url.includes('/validation'))).toBe(false);
    } finally {
      fetchMock.mockImplementation(outer!);
    }
  });
});
