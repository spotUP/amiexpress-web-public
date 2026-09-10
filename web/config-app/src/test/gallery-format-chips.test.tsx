/**
 * Every gallery card says which of the four formats the screen has.
 *
 * "can we add chips to all the thumbnails so i can quickly see how complete
 * they are for .ans/.seq/.rip". A caller is served by EXTENSION - the loader
 * tries `<stem>.rip` for a RIP terminal, `<stem>.seq` for a C64, `<stem>.tti`
 * for a teletext session and the text file otherwise - so a screen carrying
 * only one of them is a screen the other modes fall back on.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { formatsPresent } from '../pages/ScreenFilesPage';

describe('which formats a screen has', () => {
  const files = {
    'Node1/BBSTITLE.txt': { relPath: 'Node1/BBSTITLE.txt' },
    'Node1/BBSTITLE.SEQ': { relPath: 'Node1/BBSTITLE.SEQ' },
    'Node1/BBSTITLE.tti': { relPath: 'Node1/BBSTITLE.tti' },
    'Node1/MENU.TXT': { relPath: 'Node1/MENU.TXT' },
    'Node2/BBSTITLE.rip': { relPath: 'Node2/BBSTITLE.rip' },
    'Screens/BULL.GR': { relPath: 'Screens/BULL.GR' },
  };

  it('finds the siblings of the open file, whatever their case', () => {
    expect(formatsPresent('Node1/BBSTITLE.txt', files)).toEqual({ ansi: true, petscii: true, rip: false, teletext: true });
  });

  it('does not reach into another directory for a sibling', () => {
    // Node2 has the .rip; Node1's card must not claim it.
    expect(formatsPresent('Node1/BBSTITLE.txt', files).rip).toBe(false);
    expect(formatsPresent('Node2/BBSTITLE.rip', files)).toEqual({ ansi: false, petscii: false, rip: true, teletext: false });
  });

  it('counts .gr as ANSI, because that is what it is', () => {
    expect(formatsPresent('Screens/BULL.GR', files)).toEqual({ ansi: true, petscii: false, rip: false, teletext: false });
  });

  it('a screen with only text says so', () => {
    expect(formatsPresent('Node1/MENU.TXT', files)).toEqual({ ansi: true, petscii: false, rip: false, teletext: false });
  });

  it('a .tti sibling counts as teletext, not ANSI', () => {
    expect(formatsPresent('Node1/BBSTITLE.tti', files).teletext).toBe(true);
    expect(formatsPresent('Node1/BBSTITLE.tti', files).ansi).toBe(true);
  });
});

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});
const reader = [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }];

const index = {
  builtAt: '2026-09-07T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{ scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt', variants: ['BBSTITLE.txt', 'BBSTITLE.SEQ'] }],
  }],
  files: {
    'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt', sha256: 'a', readBy: reader }),
    'Node1/BBSTITLE.SEQ': file({ relPath: 'Node1/BBSTITLE.SEQ', format: 'petscii', sha256: 'b', readBy: reader }),
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
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/themes')) return envelope({ defaultSlug: 'default', canCreate: true, themes: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index);
}));

vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('the chips on a gallery card', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows ANSI and SEQ as present and RIP as missing', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Gallery/ }));

    expect(await screen.findByTestId('chip-ansi-have')).toBeTruthy();
    expect(screen.getByTestId('chip-seq-have')).toBeTruthy();
    expect(screen.getByTestId('chip-rip-missing')).toBeTruthy();
  });

  it('says what a missing format costs, for anyone who hovers', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Gallery/ }));

    expect((await screen.findByTestId('chip-rip-missing')).getAttribute('title'))
      .toMatch(/falls back/);
  });
});
