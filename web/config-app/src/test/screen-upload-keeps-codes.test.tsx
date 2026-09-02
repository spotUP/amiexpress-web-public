/**
 * Replacing a screen's art without throwing away what the screen DOES.
 *
 * The sysop's report: "if i upload a new ansi screen file to replace a screen
 * file that has mci codes etc in it the codes get wiped". A screen is a
 * program - `~SS_` includes, `~CC_` runs a door - and PabloDraw writes none of
 * that, so a replace used to drop every code silently. The menu still painted
 * and the keys stopped working.
 *
 * Driven through the page: the verdict has to reach the dialog BEFORE a
 * fan-out is chosen, and the choice has to reach the write.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const artBytes = new TextEncoder().encode('\x1b[31mHI');

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'LOGON', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/LOGON.TXT', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/LOGON.TXT': {
      relPath: 'Node1/LOGON.TXT', bytes: artBytes.length, format: 'ansi', sha256: 'a', mci: [],
    },
  },
});

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

/** Every PUT the page made, so the last one's body can be read. */
const puts: { url: string; body: Record<string, unknown> }[] = [];

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes('/api/screens/file') && init?.method === 'PUT') {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    puts.push({ url, body });

    if (body.dryRun === true) {
      return envelope({
        dryRun: true,
        targets: [{
          path: 'Node1/LOGON.TXT',
          carried: ['~SS_BBS:Node1/BBSTITLE.txt| ~SP', '~CC_gwall|'],
          lost: [{ text: '~SP', line: 4 }],
          uploadHasCodes: false,
        }],
      });
    }
    return envelope({ written: ['Node1/LOGON.TXT'] });
  }

  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/LOGON.TXT'], content: base64(artBytes) });
  }
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
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

/** Open the file, then hand the page a local .ans the way a sysop would. */
async function chooseReplacement(user: ReturnType<typeof userEvent.setup>) {
  render(<ScreenFilesPage />, { wrapper });

  // Through the gallery, which is how a designer reaches a screen: it opens
  // the FILE panel. Clicking a row in the tables opens the editor instead, and
  // the panel - with its upload input - is hidden while the editor is up.
  // The card is labelled by the screen that reads the file, or by the path
  // when nothing does - which is this fixture.
  await user.click(await screen.findByText('Node1/LOGON.TXT'));

  // By test id, not by tag: the page's FIRST file input is the archive
  // importer at the top, and picking that one uploads a screen into nothing.
  const input = screen.getByTestId('screen-upload') as HTMLInputElement;
  await user.upload(input, new File([new Uint8Array([0x1b, 0x5b, 0x33, 0x32, 0x6d])], 'new.ans'));
}

describe('replacing a screen that carries codes', () => {
  beforeEach(() => { puts.length = 0; fetchMock.mockClear(); });

  it('says what would be kept and what cannot be placed, before any fan-out is chosen', async () => {
    const user = userEvent.setup();
    await chooseReplacement(user);

    expect(await screen.findByText(/2 lines of codes kept/)).toBeTruthy();
    expect(screen.getByText(/cannot be placed \(line 4\)/)).toBeTruthy();
    expect(screen.getByText('~CC_gwall|')).toBeTruthy();
  });

  it('asks the board without writing anything', async () => {
    const user = userEvent.setup();
    await chooseReplacement(user);

    await waitFor(() => expect(puts.length).toBeGreaterThan(0));
    expect(puts.every(p => p.body.dryRun === true)).toBe(true);
  });

  it('sends the placement the sysop chose with the write', async () => {
    const user = userEvent.setup();
    await chooseReplacement(user);

    await screen.findByText(/2 lines of codes kept/);
    // By name: the file panel has a second select - what the file IS - and an
    // unnamed lookup matched whichever came first.
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Keep these codes/i }), 'below',
    );
    await user.click(screen.getByRole('button', { name: /this file only/i }));

    await waitFor(() => expect(puts.some(p => p.body.dryRun !== true)).toBe(true));
    const write = puts.filter(p => p.body.dryRun !== true).pop()!;
    expect(write.body.carryCodes).toBe('below');
  });

  it('defaults to keeping them where they were', async () => {
    const user = userEvent.setup();
    await chooseReplacement(user);

    await screen.findByText(/2 lines of codes kept/);
    await user.click(screen.getByRole('button', { name: /this file only/i }));

    await waitFor(() => expect(puts.some(p => p.body.dryRun !== true)).toBe(true));
    expect(puts.filter(p => p.body.dryRun !== true).pop()!.body.carryCodes).toBe('above');
  });
});
