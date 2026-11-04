/**
 * Door art can be drawn from the Screen Designer, not only from Screen Health.
 *
 * "door art needs to be reachable from the ansi studio" (sysop, 2026-10-14).
 * The door-art list lived only inside the sysop's Screen Health page, which
 * the level-100 artists the door-art API serves never see.
 *
 * "can we add a tab for door art that lists them as the screens? it should
 * work just like the screen view" (sysop, 2026-11-04): so a slot is a gallery
 * card on a tab of its own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const doorArt = [{
  command: 'MT', name: 'MegaTop',
  sections: [{
    file: 'Bulls.CFG', section: 'TITLE', label: 'Title logo', lines: 4,
    maxLines: 10, maxLineLength: 79,
  }],
}];

const theme = {
  slug: 'neon', title: 'Neon', owner: 'skope', author: 'skope', dir: 'Themes/neon',
  mine: true, status: 'draft', widths: [80], doorTheme: '', screens: 1, exists: true,
  wearable: true, writable: true, regressed: null,
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const doorArtCalls = vi.fn();
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/door-art/MT')) {
    doorArtCalls(url);
    return envelope([{ ...doorArt[0].sections[0], content: btoa('LOGO'), variants: {}, offers: [] }]);
  }
  if (url.includes('/api/door-art')) { doorArtCalls(url); return envelope(doorArt); }
  if (url.includes('/validation')) return envelope({ blocking: [], advisory: [], publishable: true, coverage: { provided: 1, total: 44 } });
  if (url.includes('/api/themes')) return envelope({ defaultSlug: 'default', canCreate: true, themes: [theme] });
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  if (url.includes('/config/users')) return envelope({ users: [] });
  return envelope({
    builtAt: '', unused: [], conferences: [], bulletins: [], callersByLevel: {},
    screens: [], files: {},
  });
}));

vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'skope' }, secLevel: 100 }),
}));

import { ArtistStudioPage } from '../pages/ArtistStudioPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: QUERY_DEFAULTS });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('door art in the Screen Designer', () => {
  beforeEach(() => doorArtCalls.mockClear());

  it('lists a slot as a card on the Door art tab and opens it in the door-art dialog', async () => {
    render(<ArtistStudioPage />, { wrapper });

    await userEvent.click(await screen.findByRole('tab', { name: 'Door art' }));

    const card = await screen.findByRole('button', { name: /MegaTop - Title logo/ });
    // The card drew its own art: it asked for the door's sections, not a
    // screen file, which is the seam a slot needs because it has no path.
    await waitFor(() => expect(doorArtCalls).toHaveBeenCalledWith(expect.stringContaining('/api/door-art/MT')));

    await userEvent.click(card);

    expect(await screen.findByRole('dialog', { name: 'MegaTop - Title logo' })).toBeTruthy();
  });

  it('narrows the cards with the page search box, as it does for screens', async () => {
    render(<ArtistStudioPage />, { wrapper });
    await userEvent.click(await screen.findByRole('tab', { name: 'Door art' }));
    await screen.findByRole('button', { name: /MegaTop - Title logo/ });

    await userEvent.type(screen.getByLabelText('Search screens'), 'zzz-nothing');

    expect(screen.queryByRole('button', { name: /MegaTop - Title logo/ })).toBeNull();
  });
});
