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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const ansiBytes = new TextEncoder().encode('\x1b[31mHI');

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

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../src/components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenScopeTables } from '../src/pages/ScreenScopeTables';
import { apiClient } from '../src/api/client';

/** The gallery opens first; these cases are about the tables behind it. */
async function openScreenTab(user: ReturnType<typeof userEvent.setup>, name: RegExp = /Node screens/) {
  await user.click(await screen.findByRole('tab', { name }));
}

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
    render(<ScreenScopeTables />, { wrapper });

    await openScreenTab(user);

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('ansi-canvas')).toBeTruthy();
  });

  it('does nothing for a scope where no file resolves', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await openScreenTab(user);

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('nothing resolves'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers Download inside the dialog, not on every row', async () => {
    const user = userEvent.setup();
    // It is a BUTTON, not a link: the endpoint is behind the admin's auth
    // and an anchor cannot carry the Authorization header, which is what
    // made Download answer `{"error":"Access token required"}` on live.
    const download = vi.spyOn(apiClient, 'downloadFile').mockResolvedValue(undefined);
    render(<ScreenScopeTables />, { wrapper });

    await openScreenTab(user);

    await user.click(await screen.findByText('BBSTITLE'));
    // The row itself carries no actions any more.
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();

    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /download/i }));

    expect(download).toHaveBeenCalledWith(
      expect.stringContaining('Node1%2FBBSTITLE.txt'),
      'BBSTITLE.txt',
    );
    download.mockRestore();
  });

  it('brings a file in through ONE control, not two', async () => {
    /*
     * The editor's own "Open a file into the editor" is hidden here: the
     * dialog's "Upload a drawing" sits directly below it, and two file
     * pickers side by side read as one control that does not work - "these
     * two panels are weird and doubled, some buttons dont work" (sysop,
     * 2026-09-18). PETSCII has hidden its own since September; ANSI does now
     * too, and the remaining control is the one that REPLACES the file on the
     * board, with its carry verdict and its confirmation.
     */
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await openScreenTab(user);
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click((await screen.findAllByText('Node1/BBSTITLE.txt'))[0]);
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByLabelText(/open a file into the editor/i)).toBeNull();
    expect(within(dialog).getByLabelText('Upload a drawing')).toBeTruthy();
  });
});
