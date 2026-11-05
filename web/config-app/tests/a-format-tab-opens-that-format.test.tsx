/**
 * Switching format tab switches the EDITOR, and the tabs have different names.
 *
 * Sysop, with Node0/BBSTITLE.SEQ open: "petscii selected it shows ansi and
 * text tv ansi and text ansi are named the same". Two bugs in one screenshot:
 *
 *   The tab only called `setOpenFile`. The ROW click has always routed by
 *   format (`setPendingEdit`), the tab never did - so opening an ANSI screen
 *   and then clicking PETSCII left the ANSI editor mounted over a `.seq`,
 *   drawing PETSCII bytes as text. The art arrived as scattered dots.
 *
 *   Node0 carries BBSTITLE.txt AND BBSTITLE.ttx, and every extension that was
 *   not .seq/.rip/.gr/.ibm was labelled "ANSI / text" - so two tabs had the
 *   same name and nothing said which was which.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { blankSurface, writeSeq } from '@amiexpress/bbs-door-sdk/petscii';

const seq = writeSeq(blankSurface());
const ansi = new TextEncoder().encode('\x1b[31mHELLO');
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

const FILES: Record<string, { format: string; bytes: Uint8Array }> = {
  'Node0/BBSTITLE.txt': { format: 'ansi', bytes: ansi },
  'Node0/BBSTITLE.SEQ': { format: 'petscii', bytes: seq },
  'Node0/BBSTITLE.ttx': { format: 'teletext', bytes: ansi },
};

const index = () => ({
  builtAt: '2026-09-14T00:00:00.000Z',
  unused: [],
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{
      scope: 'node', id: 0, dir: 'Node0', dirIsShared: false,
      // Variants are BARE FILENAMES, and the open file's own name is among them.
      file: 'Node0/BBSTITLE.txt', variants: ['BBSTITLE.txt', 'BBSTITLE.SEQ', 'BBSTITLE.ttx'],
    }],
  }],
  files: Object.fromEntries(Object.entries(FILES).map(([relPath, f]) => [
    relPath, { relPath, bytes: f.bytes.length, format: f.format, sha256: relPath, mci: [] },
  ])),
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    const path = decodeURIComponent(new URL(url, 'http://x').searchParams.get('path') ?? '');
    const f = FILES[path];
    return envelope({ ...index().files[path], content: base64(f.bytes) });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../src/components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenScopeTables } from '../src/pages/ScreenScopeTables';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

beforeEach(() => {
  fetchMock.mockClear();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

async function openTheAnsiScreen(user: ReturnType<typeof userEvent.setup>) {
  render(<ScreenScopeTables />, { wrapper });
  await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
  await user.click(await screen.findByText('BBSTITLE'));
  await user.click(await screen.findByText('Node0/BBSTITLE.txt'));
  return screen.findByRole('dialog');
}

describe('the format tabs on a screen', () => {
  it('opens the PETSCII editor when PETSCII is chosen, not the one already there', async () => {
    const user = userEvent.setup();
    const dialog = await openTheAnsiScreen(user);

    await user.click(within(dialog).getByRole('tab', { name: 'PETSCII' }));

    await waitFor(() =>
      expect(within(dialog).getByTestId('petscii-editor-canvas')).toBeInTheDocument());
    // The ANSI editor is GONE, not merely below it: it was drawing .seq bytes
    // as text, which is what the sysop was looking at.
    expect(within(dialog).queryByRole('button', { name: 'Centre line' })).toBeNull();
  });

  it('names teletext and ANSI differently, so no two tabs read the same', async () => {
    const user = userEvent.setup();
    const dialog = await openTheAnsiScreen(user);

    const names = within(dialog).getAllByRole('tab').map(t => t.textContent?.trim());
    expect(names).toContain('Teletext');
    expect(new Set(names).size).toBe(names.length);
  });
});
