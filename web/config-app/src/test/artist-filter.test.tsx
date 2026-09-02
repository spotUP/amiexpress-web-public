/**
 * By default the screens page shows art, and only art.
 *
 * Asked for directly: "can we add filters so the user can select to filter out
 * screens with only codes and generated screens and have this filter on by
 * default? so the ansi artists only see the screens they should touch".
 *
 * On the live board that is 400 files of art against 258 that are nothing but
 * MCI codes, 6 the board writes itself and 5 empty ones. The plumbing is one
 * checkbox away, never gone: a file the manager refuses to show is a file a
 * sysop cannot find.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isArt, toScreenRows } from '../pages/screen-index-view';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [],
  readBy: [], ...over,
});

describe('what counts as art', () => {
  it('keeps an ordinary piece', () => {
    expect(isArt(file({}) as never)).toBe(true);
  });

  it('drops a screen that is only codes', () => {
    expect(isArt(file({ codesOnly: true }) as never)).toBe(false);
  });

  it('drops a file the board writes itself', () => {
    expect(isArt(file({ generated: 'runtime' }) as never)).toBe(false);
  });

  it('drops a leftover copy', () => {
    expect(isArt(file({ generated: 'backup' }) as never)).toBe(false);
  });

  it('drops an empty file, which draws nothing', () => {
    expect(isArt(file({ bytes: 0 }) as never)).toBe(false);
  });

  it('keeps RIP and PETSCII, which are somebody\'s art too', () => {
    // Format is not part of this rule. The gallery narrows to what it can
    // DRAW; hiding a RIP screen from the tables as well would put it beyond
    // reach entirely.
    expect(isArt(file({ format: 'rip' }) as never)).toBe(true);
    expect(isArt(file({ format: 'petscii' }) as never)).toBe(true);
  });
});

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0,
      resolutions: [{ scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt' }],
    },
    {
      screen: 'AWAITSCREEN', dirType: 'node', missingScopes: 0,
      resolutions: [{ scope: 'node', id: 1, file: 'Node1/awaitscreen.txt' }],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt' }),
    // 47 copies of this on the live board, and it is one code.
    'Node1/awaitscreen.txt': file({ relPath: 'Node1/awaitscreen.txt', bytes: 15, codesOnly: true }),
  },
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  }
  return envelope(index);
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('a screen row knows whether it is worth opening', () => {
  it('is art when a file behind it is art', () => {
    const rows = toScreenRows(index as never);

    expect(rows.find(r => r.screen === 'BBSTITLE')?.hasArt).toBe(true);
  });

  it('is not art when every file behind it is only codes', () => {
    const rows = toScreenRows(index as never);

    expect(rows.find(r => r.screen === 'AWAITSCREEN')?.hasArt).toBe(false);
  });

  it('stays visible when the screen resolves to nothing at all', () => {
    // A missing screen is the most important row on the page. The first
    // version of this filter had no file to judge and hid exactly those.
    const missing = {
      ...index,
      screens: [{
        screen: 'GONE', dirType: 'node', missingScopes: 1,
        resolutions: [{ scope: 'node', id: 1, file: null }],
      }],
    };

    expect(toScreenRows(missing as never)[0].hasArt).toBe(true);
  });
});

describe('the screens page as an artist opens it', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides a codes-only screen from the tables by default', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));

    expect(await screen.findByText('BBSTITLE')).toBeTruthy();
    expect(screen.queryByText('AWAITSCREEN')).toBeNull();
  });

  it('shows it once the sysop asks for the plumbing', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(screen.getByRole('checkbox', { name: /plumbing/i }));

    expect(await screen.findByText('AWAITSCREEN')).toBeTruthy();
  });
});
