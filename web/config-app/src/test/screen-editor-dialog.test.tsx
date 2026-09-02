/**
 * The editor opens in a dialog, not further down a very tall page.
 *
 * The sysop: "the edit button doesnt scroll to the content i should edit,
 * maybe open in a dialog instead? the page is extremely tall and
 * unmanageable." Editing an 80x25 canvas inline added another screenful under
 * a table, a resolutions list and a preview.
 *
 * Saving stays inside the dialog too - the fan-out choice was rendered in the
 * page below, so choosing where the bytes go meant hunting for it after the
 * editor closed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const ansiBytes = new TextEncoder().encode('\x1b[31mHI');

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansiBytes.length, format: 'ansi', sha256: 'a', mci: [],
    },
  },
};

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/api/screens/file') && init?.method === 'PUT') return envelope({ written: 1 });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index.files['Node1/BBSTITLE.txt'], content: base64(ansiBytes) });
  }
  if (url.includes('/shared-directories')) return envelope({ directories: [] });
  return envelope(index);
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

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  render(<ScreenFilesPage />, { wrapper });
  await user.click(await screen.findByText('BBSTITLE'));
  // The row opens the art; there is no Edit button any more.
  const rows = await screen.findAllByText('Node1/BBSTITLE.txt');
  await user.click(rows[0]);
  return screen.findByRole('dialog');
}

describe('the editor as a dialog', () => {
  beforeEach(() => fetchMock.mockClear());

  it('opens over the page, named after the file', async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);

    expect(within(dialog).getByTestId('ansi-canvas')).toBeTruthy();
    expect(dialog.textContent).toContain('Node1/BBSTITLE.txt');
  });

  it('asks where the bytes go without leaving the dialog', async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);

    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    // The fan-out choice used to render in the page underneath.
    expect(await within(dialog).findByText('this file only')).toBeTruthy();
  });

  it('writes the bytes and closes', async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);

    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await user.click(await within(dialog).findByText('this file only'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(put).toBeTruthy();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('scrolls a tall screen inside the canvas, not by moving the tools', async () => {
    // BBSTITLE on the live board is several screens tall. An unbounded canvas
    // container grew and the DIALOG scrolled, taking the tool row and the
    // colour pickers off the top with it.
    const user = userEvent.setup();
    const dialog = await openEditor(user);

    const viewport = within(dialog).getByTestId('canvas-viewport');
    expect(viewport.className).toMatch(/overflow-auto/);
    expect(viewport.className).toMatch(/max-h-/);
    expect(viewport.contains(within(dialog).getByTestId('ansi-canvas'))).toBe(true);
  });

  it('goes back to the file on cancel, without writing', async () => {
    // Cancel leaves the EDITOR, not the file: the dialog is where the file's
    // details, its preview and its MCI list live now.
    const user = userEvent.setup();
    const dialog = await openEditor(user);

    await user.click(within(dialog).getByRole('button', { name: /cancel editing/i }));

    await waitFor(() => expect(screen.queryByTestId('ansi-canvas')).toBeNull());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PUT')).toBe(false);
  });
});
