/**
 * AN OPEN EDITOR BELONGS TO THE FILE IT WAS OPENED FOR.
 *
 * Sysop, 2026-09-14: "samilog opened as petscii and there are no buttons to
 * switch after i had nother petscii screen loaded before". The screenshot
 * showed `Utils/samilog/samilog.header.txt.gr` - an ANSI file - drawn in the
 * PETSCII editor, its escape sequences rendered as C64 glyphs, and no format
 * strip to escape with.
 *
 * `editingPetscii` was a bare boolean. Only the routing effect cleared it, and
 * that effect returns early unless an edit was explicitly requested
 * (`!pendingEdit`), so merely opening another file left the previous file's
 * editor mounted over the new file's bytes. Saving would have written PETSCII
 * over the ANSI.
 *
 * The rule pinned here is the invariant, not the symptom: change the open
 * file, and no editor opened for the previous one survives.
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

// Two different screens, because the sysop's second file was a different
// screen entirely - Utils/samilog/samilog.header.txt.gr - not another format
// of the one already open.
const FILES: Record<string, { format: string; bytes: Uint8Array }> = {
  'Node0/BBSTITLE.SEQ': { format: 'petscii', bytes: seq },
  'Utils/samilog/samilog.header.txt.gr': { format: 'ansi', bytes: ansi },
};

const index = () => ({
  builtAt: '2026-09-14T00:00:00.000Z',
  unused: [{
    relPath: 'Utils/samilog/samilog.header.txt.gr',
    bytes: ansi.length, format: 'ansi', sha256: 'samilog', mci: [],
  }],
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{
      scope: 'node', id: 0, dir: 'Node0', dirIsShared: false,
      file: 'Node0/BBSTITLE.SEQ', variants: ['BBSTITLE.SEQ'],
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
    const p = decodeURIComponent(new URL(url, 'http://x').searchParams.get('path') ?? '');
    const f = FILES[p];
    return envelope({ ...index().files[p], content: base64(f.bytes) });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
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
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

beforeEach(() => {
  fetchMock.mockClear();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('an editor belongs to its own file', () => {
  it('does not leave the PETSCII editor open over the next file opened', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));

    // A PETSCII screen, opened and edited: this is the state that leaked.
    await user.click(await screen.findByText('Node0/BBSTITLE.SEQ'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('petscii-editor-canvas')).toBeInTheDocument());

    // Closed, the way the sysop closed it. The modal's own handler listed the
    // editors it put away, and PETSCII was never added to that list.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The sysop's own file: one nothing reads. Its row opens a file and asks
    // for no edit, so the routing effect below never runs to correct the
    // editor left over from the screen before.
    await user.click(await screen.findByRole('tab', { name: /Read by nothing/ }));
    await user.click(await screen.findByText('Utils/samilog/samilog.header.txt.gr'));
    await screen.findByRole('dialog');

    // The PETSCII editor must not come back with it: these are ANSI bytes, and
    // it would draw the escape sequences as C64 glyphs - what the sysop saw.
    await waitFor(() =>
      expect(screen.queryByTestId('petscii-editor-canvas')).toBeNull());
  });
});
