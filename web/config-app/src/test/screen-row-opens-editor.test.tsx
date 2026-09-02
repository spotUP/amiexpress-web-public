/**
 * A row in the resolutions table opens the art.
 *
 * Asked for: "make all screens open the edit dialog when i click their lines
 * in the table move the download button into the ansi edit dialog. the ansi
 * edit dialog also needs to let me upload local ansi files and replace the
 * content."
 *
 * So the row IS the affordance - no Edit button to find - Download lives where
 * the file is open rather than in every row, and a local .ans can be brought
 * into the canvas the same way a sysop would have replaced the file.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const ansiBytes = new TextEncoder().encode('\x1b[31mHI');
const uploadBytes = new TextEncoder().encode('\x1b[32mUP');

let fileFormat = 'ansi';

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
        { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: null, variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansiBytes.length, format: fileFormat, sha256: 'a', mci: [],
    },
  },
});

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/BBSTITLE.txt'], content: base64(ansiBytes) });
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

describe('opening a screen from its row', () => {
  beforeEach(() => { fileFormat = 'ansi'; fetchMock.mockClear(); });

  it('opens the editor on the art, with no button to hunt for', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('ansi-canvas')).toBeTruthy();
  });

  it('does nothing for a scope where no file resolves', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('nothing resolves'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers Download inside the dialog, not on every row', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));
    // The row itself carries no actions any more.
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();

    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));
    const dialog = await screen.findByRole('dialog');
    const download = within(dialog).getByRole('link', { name: /download/i });

    expect(download.getAttribute('href')).toContain('Node1%2FBBSTITLE.txt');
  });

  it('loads a local ANSI file into the canvas it is editing', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));
    const dialog = await screen.findByRole('dialog');

    const file = new File([uploadBytes], 'newtitle.ans', { type: 'application/octet-stream' });
    await user.upload(within(dialog).getByLabelText(/open a file into the editor/i), file);

    // The canvas is replaced by what the file holds - saving still goes out
    // through the same fan-out, so nothing is written yet.
    await waitFor(() => {
      expect(within(dialog).getByTestId('ansi-canvas').getAttribute('data-cols')).toBeTruthy();
    });
    expect(fetchMock.mock.calls.some(call => call[1]?.method === 'PUT')).toBe(false);
  });
});
