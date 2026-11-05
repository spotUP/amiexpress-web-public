/**
 * A screen's missing formats are offered where its existing one is shown.
 *
 * "there is no way to upload/complete a screen with .seq/.rip in the screen
 * editor admin ui?" - there was not. The format strip listed only the files on
 * disk, and Replace wrote onto the open file's own path. Now the strip offers
 * "+ PETSCII" and "+ RIP" for what the screen lacks, and the chosen file is
 * written as that format to every node that has the open file.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { missingFormats } from '../src/pages/ScreenScopeTables';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});

/** BBSTITLE on two nodes, ANSI only - no .seq, no .rip. */
const index = {
  builtAt: '2026-09-07T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [
      { scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt', variants: ['BBSTITLE.txt'] },
      { scope: 'node', id: 2, file: 'Node2/BBSTITLE.txt', variants: ['BBSTITLE.txt'] },
    ],
  }],
  files: {
    'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt', sha256: 'same', readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }] }),
    'Node2/BBSTITLE.txt': file({ relPath: 'Node2/BBSTITLE.txt', sha256: 'same', readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 2, via: 'resolved' }] }),
  },
};

const calls: { method: string; url: string; body?: unknown }[] = [];
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file') && (init?.method ?? 'GET') === 'GET') {
    return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  }
  if (url.includes('/api/screens/file')) return envelope({ written: 2 });
  if (url.includes('/api/themes')) return envelope({ defaultSlug: 'default', canCreate: true, themes: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index);
}));

vi.mock('../src/components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreenScopeTables } from '../src/pages/ScreenScopeTables';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('which formats a screen lacks', () => {
  it('offers PETSCII, RIP and Teletext for a screen that only has ANSI', () => {
    expect(missingFormats('Node1/BBSTITLE.txt', ['Node1/BBSTITLE.txt']).map(m => `${m.label}:${m.path}`))
      .toEqual(['PETSCII:Node1/BBSTITLE.seq', 'RIP:Node1/BBSTITLE.rip', 'Teletext (native packets - author externally):Node1/BBSTITLE.tti']);
  });

  it('offers nothing a screen already has, whatever the case of the name', () => {
    expect(missingFormats('Node1/BBSTITLE.txt', ['Node1/BBSTITLE.txt', 'Node1/BBSTITLE.SEQ', 'Node1/bbstitle.rip', 'Node1/BBSTITLE.TTI'])).toEqual([]);
  });

  it('counts a .gr as the ANSI slot', () => {
    expect(missingFormats('Node1/MENU.GR', ['Node1/MENU.GR']).map(m => m.ext)).toEqual(['seq', 'rip', 'tti']);
  });
});

describe('adding a format from the editor', () => {
  beforeEach(() => { calls.length = 0; });

  it('shows the missing formats beside the one that exists', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));   // the file, in its dialog

    expect(await screen.findByRole('button', { name: '+ PETSCII' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ RIP' })).toBeTruthy();
  });

  it('writes the chosen file as that format to every node that has the screen', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.txt'));
    await user.click(await screen.findByRole('button', { name: '+ RIP' }));

    const input = screen.getByTestId('screen-add-format') as HTMLInputElement;
    const rip = new File([new Uint8Array([0x21, 0x7c, 0x31, 0x4b])], 'title.rip', { type: 'application/octet-stream' });
    fireEvent.change(input, { target: { files: [rip] } });

    await waitFor(() => expect(calls.some(c => c.method === 'PUT')).toBe(true));
    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.url).toContain('path=' + encodeURIComponent('Node1/BBSTITLE.rip'));
    const body = put.body as { targets: string[]; carryCodes: string };
    expect(body.targets.sort()).toEqual(['Node1/BBSTITLE.rip', 'Node2/BBSTITLE.rip']);
    // No existing RIP to carry codes from.
    expect(body.carryCodes).toBe('none');
  });
});
