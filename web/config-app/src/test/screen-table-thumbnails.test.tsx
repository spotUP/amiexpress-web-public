/**
 * The tables show the art too, not only the gallery.
 *
 * Asked for directly: "it would be nice with thumbnails for all screen files
 * in all the tabs". The node, conference and board tabs listed BBSTITLE, MENU
 * and CONF_BULL and left a person to guess which picture each one is - which
 * is the same reason the gallery exists at all.
 *
 * It only became affordable once a thumbnail stopped allocating a full
 * 1280x800 editor canvas per card (see gallery-canvas-size.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { toScreenRows } from '../pages/screen-index-view';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  conferences: [],
  bulletins: [],
  callersByLevel: {},
  screens: [
    {
      screen: 'BBSTITLE',
      dirType: 'node',
      missingScopes: 0,
      resolutions: [{ scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt' }],
    },
    {
      screen: 'GONE',
      dirType: 'node',
      missingScopes: 1,
      resolutions: [{ scope: 'node', id: 1, file: null }],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: 20, format: 'ansi', sha256: 'a',
      mci: [], problems: [], readBy: [],
    },
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

describe('a screen row carries the art it resolves to', () => {
  it('picks a file that can actually be drawn', () => {
    const [title] = toScreenRows(index as never);

    expect(title.previewPath).toBe('Node1/BBSTITLE.txt');
  });

  it('has nothing to preview when the screen resolves nowhere', () => {
    const rows = toScreenRows(index as never);

    expect(rows.find(r => r.screen === 'GONE')?.previewPath).toBeNull();
  });

  it('does not offer a RIP file as a preview, which this cannot draw', () => {
    const ripOnly = {
      ...index,
      screens: [{
        screen: 'RIPPY', dirType: 'node', missingScopes: 0,
        resolutions: [{ scope: 'node', id: 1, file: 'Node1/RIPPY.RIP' }],
      }],
      files: {
        'Node1/RIPPY.RIP': {
          relPath: 'Node1/RIPPY.RIP', bytes: 9, format: 'rip', sha256: 'r',
          mci: [], problems: [], readBy: [],
        },
      },
    };

    expect(toScreenRows(ripOnly as never)[0].previewPath).toBeNull();
  });
});

describe('the screen tabs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('draw a thumbnail beside each screen', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));

    expect((await screen.findAllByTestId('screen-thumbnail')).length).toBeGreaterThan(0);
  });

  it('says so for a screen with nothing to draw', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));

    expect(await screen.findByText('nothing to draw')).toBeTruthy();
  });
});
