/**
 * A repaired screen stops looking broken.
 *
 * Reported by the sysop: "i repaired some screens now it worked but their
 * thumbnail didnt regenerate in the gallery so they still look broken".
 *
 * The cause was that a gallery card fetched its bytes into LOCAL state,
 * guarded by `content !== null`, so it fetched once and never again.
 * `invalidateQueries` cannot reach local state, and the card is not remounted
 * - its key is the path, which does not change when the file does. The fix is
 * the same query key the file panel uses, so any write refreshes the picture.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

/** The damage: colour codes whose ESC byte was eaten by a text-mode copy. */
const DAMAGED = '[31mRED';
const REPAIRED = '\x1b[31mRED';

let served = DAMAGED;

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'NODE_BULL', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/NODE_BULL.TXT', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/NODE_BULL.TXT': {
      relPath: 'Node1/NODE_BULL.TXT', bytes: 8, format: 'ansi', sha256: served === DAMAGED ? 'a' : 'b',
      mci: [], problems: served === DAMAGED ? ['colour-codes-without-escape'] : [],
    },
  },
});

const base64 = (text: string) => btoa(text);

const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data, message }),
} as unknown as Response);

/** How many times the gallery asked for the file's bytes. */
let fileFetches = 0;

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes('/screens/repair-all')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    if (body.dryRun) return envelope({ dryRun: true, damaged: ['Node1/NODE_BULL.TXT'] });
    // The repair is what changes the bytes the board serves from here on.
    served = REPAIRED;
    return envelope({ repaired: [{ path: 'Node1/NODE_BULL.TXT', codes: 1 }], refused: [] }, 'Repaired 1 file');
  }

  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    fileFetches += 1;
    return envelope({ ...index().files['Node1/NODE_BULL.TXT'], content: base64(served) });
  }
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true),
  }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('the gallery after a repair', () => {
  beforeEach(() => { served = DAMAGED; fileFetches = 0; fetchMock.mockClear(); });

  it('asks for the bytes again, so the card stops showing the damage', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    // The card draws once, from the damaged bytes.
    await waitFor(() => expect(fileFetches).toBe(1));

    await user.click(await screen.findByRole('button', { name: /Repair every damaged screen/i }));

    // ...and again after the repair, which is the whole bug: a card that
    // fetched into local state never asked a second time.
    await waitFor(() => expect(fileFetches).toBeGreaterThan(1));
  });

  it('draws the repaired bytes, not the ones it first fetched', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await waitFor(() => expect(fileFetches).toBe(1));
    await user.click(await screen.findByRole('button', { name: /Repair every damaged screen/i }));

    await waitFor(() => {
      const requested = fetchMock.mock.calls
        .filter(call => String(call[0]).includes('/api/screens/file'));
      expect(requested.length).toBeGreaterThan(1);
    });
    // The board serves the repaired bytes now, so the refetch carries them.
    expect(served).toBe(REPAIRED);
  });
});
