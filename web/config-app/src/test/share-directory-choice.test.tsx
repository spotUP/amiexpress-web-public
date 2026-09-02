/**
 * Sharing points nodes at a directory that EXISTS.
 *
 * The sysop clicked "40 copies with identical content - they can be read from
 * one directory instead" and got "The shared directory is outside the board
 * root". The page asked for `Screens/Shared`, hardcoded, which that board does
 * not have; its real shared directory is `Screens/Node`, where 215 nodes
 * already read from. The board now reports which directories can be shared,
 * and the page asks rather than assumes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0,
      duplicateGroups: [{ sha256: 'a', paths: ['Node1/BBSTITLE.txt', 'Node2/BBSTITLE.txt'] }],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
        { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: 'Node2/BBSTITLE.txt', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': { relPath: 'Node1/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a', mci: [] },
    'Node2/BBSTITLE.txt': { relPath: 'Node2/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a', mci: [] },
  },
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) {
    return envelope({ directories: [{ dir: 'Screens/Node', files: 12 }, { dir: 'Screens', files: 30 }] });
  }
  if (url.includes('/api/screens/share')) return envelope({ wouldWrite: ['Node1.info'], canShare: [1, 2] });
  if (url.includes('/api/screens/file')) return envelope({ ...index.files['Node1/BBSTITLE.txt'], content: '' });
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

describe('choosing the directory to share from', () => {
  beforeEach(() => fetchMock.mockClear());

  it('offers the directories the board actually has', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    await openScreenTab(user);
    await user.click(await screen.findByText('BBSTITLE'));

    const picker = await screen.findByLabelText(/share from/i);
    expect(picker).toBeTruthy();
    expect(within(picker as HTMLSelectElement).getByText('Screens/Node (12 screens)')).toBeTruthy();
  });

  it('asks the board about the chosen one, not a hardcoded name', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    await openScreenTab(user);
    await user.click(await screen.findByText('BBSTITLE'));

    await user.selectOptions(await screen.findByLabelText(/share from/i), 'Screens');
    await user.click(screen.getByRole('button', { name: /check this directory/i }));

    await waitFor(() => {
      // '/api/screens/shared-directories' also starts with '/api/screens/share'.
      const call = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/api/screens/share') && init?.method === 'POST');
      expect(call).toBeTruthy();
      expect(String(call?.[1]?.body)).toContain('"sharedDir":"Screens"');
    });
  });
});

import { within } from '@testing-library/react';

/** The gallery opens first; these cases are about the tables behind it. */
async function openScreenTab(user: ReturnType<typeof userEvent.setup>, name: RegExp = /Node screens/) {
  await user.click(await screen.findByRole('tab', { name }));
}
