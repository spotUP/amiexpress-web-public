/**
 * Screen Files, split by what a screen IS.
 *
 * The sysop's words: "it seem to list different types after each other, make
 * this tabbed it's a long and messy page". One table held every screen the
 * board can display - node screens, conference screens, board screens - one
 * after another, with the detail panel below all of them.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [
    { relPath: 'Screens/leftover.txt', bytes: 12, format: 'text', sha256: 'z', mci: [] },
  ],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
      ],
    },
    {
      screen: 'CONF_JOINMSGBASE', dirType: 'conf', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'conf', id: 5, dir: 'Conf12', dirIsShared: false, file: null, variants: [] },
      ],
    },
    {
      screen: 'BULL', dirType: 'global', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'board', id: null, dir: '.', dirIsShared: false, file: 'BULL.txt', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': { relPath: 'Node1/BBSTITLE.txt', bytes: 6, format: 'ansi', sha256: 'a', mci: [] },
    'BULL.txt': { relPath: 'BULL.txt', bytes: 9, format: 'text', sha256: 'b', mci: [] },
  },
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index.files['Node1/BBSTITLE.txt'], content: '' });
  }
  return envelope(index);
}));

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

describe('Screen Files, tabbed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens on node screens, and shows only those', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByText('BBSTITLE')).toBeTruthy();
    expect(screen.queryByText('CONF_JOINMSGBASE')).toBeNull();
    expect(screen.queryByText('BULL')).toBeNull();
  });

  it('counts what is behind each tab, so the sysop knows before clicking', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByRole('tab', { name: /Node screens 1/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Conference screens 1/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Board screens 1/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Read by nothing 1/ })).toBeTruthy();
  });

  it('shows conference screens under their own tab', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Conference screens/ }));

    expect(await screen.findByText('CONF_JOINMSGBASE')).toBeTruthy();
    expect(screen.queryByText('BBSTITLE')).toBeNull();
  });

  it('lists the files nothing reads under their own tab', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Read by nothing/ }));

    expect(await screen.findByText('Screens/leftover.txt')).toBeTruthy();
  });

  it('still opens a screen from inside its tab', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));

    const detail = await screen.findByTestId('screen-detail');
    // The resolution row names the file and opens it when clicked.
    expect(within(detail).getByText('Node1/BBSTITLE.txt')).toBeTruthy();
  });
});
