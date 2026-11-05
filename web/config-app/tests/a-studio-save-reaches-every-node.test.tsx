/**
 * "i uploaded a petscii bbs title now but it doesnt display the ansi displays"
 *
 * It displayed the old one. The live log named the file the caller was served
 * - `Node1/BBSTITLE.SEQ`, 1 834 bytes, dated November - while the upload had
 * landed on `Node0/BBSTITLE.SEQ`, 1 253 bytes, minutes earlier. This board
 * keeps 41 separate copies of that screen.
 *
 * The gallery draws ONE card for all of them (it dedupes by content and says
 * "and 40 identical copies"), and the dialog behind that card wrote the single
 * path it happened to hold. The sysop page has had the fan-out rule since it
 * was written; the studio never used it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../src/lib/query-client';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** One screen, three node copies with the same bytes, and a theme's own. */
const file = (relPath: string, sha256: string, over: Record<string, unknown> = {}) => ({
  relPath, bytes: 10, format: 'ansi', sha256, mci: [], problems: [],
  readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }], ...over,
});

const index = {
  builtAt: '', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [
      { scope: 'node', id: 0, file: 'Node0/BBSTITLE.SEQ', variants: [] },
      { scope: 'node', id: 1, file: 'Node1/BBSTITLE.SEQ', variants: [] },
      { scope: 'node', id: 2, file: 'Node2/BBSTITLE.SEQ', variants: [] },
    ],
  }],
  files: {
    'Node0/BBSTITLE.SEQ': file('Node0/BBSTITLE.SEQ', 'same'),
    'Node1/BBSTITLE.SEQ': file('Node1/BBSTITLE.SEQ', 'same'),
    'Node2/BBSTITLE.SEQ': file('Node2/BBSTITLE.SEQ', 'same'),
    'Themes/neon/Node/BBSTITLE.SEQ': file('Themes/neon/Node/BBSTITLE.SEQ', 'theme-copy', { theme: 'neon' }),
  },
};

const writes: Array<{ url: string; body: string }> = [];
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') === 'PUT') writes.push({ url, body: String(init?.body ?? '') });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../src/pages/ArtistScreenDialog';
import type { ScreenIndexShape } from '../src/pages/screen-index-view';

const boardTheme = { slug: 'default', title: "The board's own screens", status: 'live' as const, dir: '', owner: 'tango', screens: null, mine: true };
const neon = { slug: 'neon', title: 'Neon', status: 'draft' as const, dir: 'Themes/neon', owner: 'skope', screens: 1, mine: true };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const targetsOf = (body: string): string[] => JSON.parse(body).targets ?? [];

describe('saving a screen that every node keeps its own copy of', () => {
  beforeEach(() => {
    writes.length = 0;
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  });

  it('writes every identical copy, not the one behind the card', async () => {
    const user = userEvent.setup();
    render(
      <ArtistScreenDialog
        path="Node0/BBSTITLE.SEQ"
        theme={boardTheme}
        index={index as unknown as ScreenIndexShape}
        onClose={vi.fn()}
        onOpenPath={vi.fn()}
      />,
      { wrapper },
    );

    // The upload path is the one the sysop used.
    const chooser = await screen.findByLabelText('Upload a drawing');
    await user.upload(chooser, new File([new Uint8Array([0x93, 0x41])], 'title.seq'));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    // The dry run carries the same targets the write will.
    const targets = targetsOf(writes[0].body);
    expect(targets).toContain('Node0/BBSTITLE.SEQ');
    expect(targets).toContain('Node1/BBSTITLE.SEQ');
    expect(targets).toContain('Node2/BBSTITLE.SEQ');
    // Never somebody's theme: those bytes are theirs, and the sandbox would
    // refuse the whole write.
    expect(targets).not.toContain('Themes/neon/Node/BBSTITLE.SEQ');
  });

  /*
   * THE SECOND UPLOAD, after the first one diverged.
   *
   * `same-content` covers the copies byte-identical to the file being edited,
   * which is exactly wrong once one has diverged: the sysop's first PETSCII
   * title landed on `Node0/BBSTITLE.SEQ` alone, and from then on that file
   * matched nothing, so the next upload fanned out to itself and the board
   * went on serving the other 46 copies - "the bbs still reads the old bbs
   * title petscii i have changed it in the default theme".
   */
  it('re-converges a screen whose copies have already drifted apart', async () => {
    const drifted = {
      ...index,
      files: {
        ...index.files,
        // What the earlier upload left behind: this one is nobody's twin.
        'Node0/BBSTITLE.SEQ': file('Node0/BBSTITLE.SEQ', 'already-different'),
      },
    };
    const user = userEvent.setup();
    render(
      <ArtistScreenDialog
        path="Node0/BBSTITLE.SEQ"
        theme={boardTheme}
        index={drifted as unknown as ScreenIndexShape}
        onClose={vi.fn()}
        onOpenPath={vi.fn()}
      />,
      { wrapper },
    );

    const chooser = await screen.findByLabelText('Upload a drawing');
    await user.upload(chooser, new File([new Uint8Array([0x93, 0x43])], 'title.seq'));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const targets = targetsOf(writes[0].body);
    // Red before: just Node0, for ever.
    expect(targets).toContain('Node1/BBSTITLE.SEQ');
    expect(targets).toContain('Node2/BBSTITLE.SEQ');
    expect(targets).toContain('Node0/BBSTITLE.SEQ');
  });

  it('an artist writes only inside their own theme', async () => {
    const user = userEvent.setup();
    render(
      <ArtistScreenDialog
        path="Themes/neon/Node/BBSTITLE.SEQ"
        theme={neon}
        index={index as unknown as ScreenIndexShape}
        onClose={vi.fn()}
        onOpenPath={vi.fn()}
      />,
      { wrapper },
    );

    const chooser = await screen.findByLabelText('Upload a drawing');
    await user.upload(chooser, new File([new Uint8Array([0x93, 0x42])], 'title.seq'));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(targetsOf(writes[0].body)).toEqual(['Themes/neon/Node/BBSTITLE.SEQ']);
  });
});
