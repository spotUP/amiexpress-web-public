/**
 * One shape under ['mci-catalog'], whichever consumer writes it first.
 *
 * Three places ask for the MCI catalog: the editor (to explain the code under
 * the cursor), the picker inside it (to take a code apart and offer the list)
 * and Screen health (to count uses). React Query keys the cache, not the
 * shape - so a consumer that stores the ENVELOPE and one that stores the
 * PAYLOAD hand each other something the other cannot read, and the one that
 * mounted second gets `undefined` off it.
 *
 * `ScreenEditor` stored `{ success, data }` with `staleTime: Infinity` and the
 * picker stored `data`. It never showed, because the Screens page ran its own
 * catalog query in the payload shape before any editor mounted. Moving that
 * query to Screen health (S7) took the accident away and the picker threw
 * "codes is not iterable" the moment a sysop tried to CHANGE a code already in
 * a screen.
 *
 * The pin is on the CACHE ENTRY, not on a rendered control: a second mount
 * with a different `staleTime` can repair the entry within a tick, so a test
 * that only clicks through passes on the broken code.
 *
 * The same shape this repo has been bitten by with ['screen-themes'] and with
 * two ['drives'] queries.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { QUERY_DEFAULTS } from '../lib/query-client';
import type { ReactNode } from 'react';

const ansi = new TextEncoder().encode('~CC_gwall|');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const CATALOG = {
  families: [{ family: 'include', label: 'Screens and commands' }],
  codes: [{
    code: 'CC_', summary: 'Run a BBS command', family: 'include',
    argument: { kind: 'command' }, takesWidth: false, terminator: '|',
    source: 'express.e:5555', handledBy: 'caller', uses: 0, files: 0,
  }],
  enablingTilde: { uses: 1, files: 1 },
};

const index = () => ({
  builtAt: '2026-09-17T00:00:00.000Z',
  unused: [],
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{
      scope: 'node', id: 1, dir: 'Node1', dirIsShared: false,
      file: 'Node1/BBSTITLE.txt', variants: ['BBSTITLE.txt'],
    }],
  }],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansi.length, format: 'ansi', sha256: 'a',
      mci: [{ code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false }],
    },
  },
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/mci/catalog')) return envelope(CATALOG);
  if (url.includes('/api/screens/mci/targets')) {
    return envelope({ kind: 'command', targets: [{ value: 'gwall', label: 'Global Wall' }] });
  }
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/BBSTITLE.txt'], content: base64(ansi) });
  }
  if (url.includes('/api/themes')) return envelope({ themes: [], defaultSlug: 'default', canCreate: true });
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenScopeTables } from '../pages/ScreenScopeTables';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('the MCI catalog cache', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    // The APP's defaults, not a test's: at staleTime 0 a second mount
    // refetches and hides the bug this file exists for.
    client = new QueryClient({
      defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
    });
  });

  it('holds the PAYLOAD, which is the shape every reader unwraps', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    // The editor is the first consumer to mount, and it is the one that used
    // to write the envelope.
    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click((await screen.findAllByText('Node1/BBSTITLE.txt'))[0]);

    await waitFor(() => expect(client.getQueryData(['mci-catalog'])).toBeTruthy());

    const cached = client.getQueryData(['mci-catalog']) as { codes?: unknown[]; data?: unknown };
    expect(Array.isArray(cached.codes), 'the entry is not the payload').toBe(true);
    expect(cached.data, 'the entry is an envelope, which no reader unwraps').toBeUndefined();
  });

  it('lets the picker take apart a code already in the screen', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click((await screen.findAllByText('Node1/BBSTITLE.txt'))[0]);

    await user.click(await screen.findByRole('button', { name: 'change' }));

    // Open ON the code: the picker read `codes` off the editor's envelope and
    // threw before it got this far.
    const commands = await screen.findByRole('combobox');
    await waitFor(() => expect((commands as HTMLSelectElement).value).toBe('gwall'));
  });
});
