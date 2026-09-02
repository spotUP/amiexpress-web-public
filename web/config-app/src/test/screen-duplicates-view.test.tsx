/**
 * The Duplicates tab: one row per screen, never one row per copy.
 *
 * Asked for in these terms - "dont list all clones when not needed we can just
 * show that there are more clones... we need a smooth way to edit all these
 * dupes". Original AmiExpress addressed 32 nodes (axcommon.e:28); this port
 * addresses 255, which is what turns a per-node copy into 800 files.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

/** One shared file 40 nodes read, plus 38 stale per-node copies nothing reads. */
const files = () => {
  const out: Record<string, unknown> = {
    'Screens/Node/Logoff.txt': {
      relPath: 'Screens/Node/Logoff.txt', bytes: 10, format: 'ansi', sha256: 'shared', mci: [],
      readBy: Array.from({ length: 40 }, (_, i) => ({
        screen: 'LOGOFF', scope: 'node', id: i + 7, via: 'resolved',
      })),
    },
  };
  for (let n = 1; n <= 38; n += 1) {
    out[`Node${n}/Screens/Logoff.txt`] = {
      relPath: `Node${n}/Screens/Logoff.txt`, bytes: 10, format: 'ansi', sha256: 'stale', mci: [],
    };
  }
  return out;
};

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [{
    screen: 'LOGOFF', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{
      scope: 'node', id: 7, dir: 'Screens/Node', dirIsShared: true,
      file: 'Screens/Node/Logoff.txt', variants: [],
    }],
  }],
  files: files(),
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: btoa('art') });
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

async function openDuplicates(user: ReturnType<typeof userEvent.setup>) {
  render(<ScreenFilesPage />, { wrapper });
  await user.click(await screen.findByRole('tab', { name: /Duplicates/ }));
}

describe('the Duplicates tab', () => {
  beforeEach(() => fetchMock.mockClear());

  it('shows 39 copies as ONE row, not as thirty-nine', async () => {
    const user = userEvent.setup();
    await openDuplicates(user);

    expect(await screen.findByText('Logoff.txt')).toBeTruthy();
    // The stale copies are counted, never listed.
    expect(screen.queryByText('Node1/Screens/Logoff.txt')).toBeNull();
    expect(screen.queryByText('Node2/Screens/Logoff.txt')).toBeNull();
  });

  it('says how many versions there are, so drift is visible at a glance', async () => {
    const user = userEvent.setup();
    await openDuplicates(user);

    expect(await screen.findByText('39 copies in 2 versions')).toBeTruthy();
  });

  it('says who actually sees each version, counted in nodes and not in files', async () => {
    const user = userEvent.setup();
    await openDuplicates(user);

    const readership = await screen.findByText(/read by 40 nodes/);
    // The 38 stale copies are displayed by nobody, and the row says so rather
    // than implying every copy matters.
    expect(readership.textContent).toContain('read by nothing');
  });

  it('opens the copy callers actually see, not whichever the index listed first', async () => {
    const user = userEvent.setup();
    await openDuplicates(user);

    // The row already names the file to edit, so before the click the path
    // appears once. Opening it puts the same path in the file panel.
    expect(screen.getAllByText('Screens/Node/Logoff.txt')).toHaveLength(1);

    await user.click(await screen.findByText('Logoff.txt'));

    await waitFor(() =>
      expect(screen.getAllByText('Screens/Node/Logoff.txt').length).toBeGreaterThan(1));
  });

  it('counts the tab by screens, not by files', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByRole('tab', { name: 'Duplicates 1' })).toBeTruthy();
  });
});
